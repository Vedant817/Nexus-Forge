import { describe, expect, it, vi } from 'vitest'
import { JobKind } from '@prisma/client'
import type { ClaimedJob, JobLeaseRepository } from '@/lib/execution/job-repository'
import { readFileSync } from 'node:fs'
import { AnalysisCancelledError, classifyFailure, runWorkerOnce } from '@/lib/execution/worker-core'
import { LeaseLostError } from '@/lib/execution/errors'
import { decideStageResume, stageIdentityMatches } from '@/lib/execution/stage-resume'
import { canPublishLegacyProjection } from '@/lib/execution/publication-policy'
import { AgentOutputValidationError, ModelBoundaryError } from '@/lib/ai/errors'

const job: ClaimedJob = {
  id: 'job-1',
  kind: JobKind.ANALYSIS,
  projectId: 'project-1',
  ownerId: 'user-1',
  analysisRunId: 'run-1',
  webhookDeliveryId: null,
  payload: null,
  attemptCount: 1,
  maxAttempts: 3,
  leaseToken: 'lease-1',
}

function repository(overrides: Partial<JobLeaseRepository> = {}): JobLeaseRepository {
  return {
    claim: vi.fn().mockResolvedValue(job),
    validate: vi.fn().mockResolvedValue(true),
    heartbeat: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    cancel: vi.fn().mockResolvedValue(true),
    retryOrDead: vi.fn().mockResolvedValue('retry'),
    ...overrides,
  }
}

describe('durable worker core', () => {
  it('completes a claimed job only through the lease repository fence', async () => {
    const repo = repository()
    const handler = vi.fn().mockResolvedValue(undefined)
    await expect(runWorkerOnce({ repository: repo, handler, workerId: 'worker-1', leaseMs: 60_000 })).resolves.toBe('succeeded')
    expect(repo.complete).toHaveBeenCalledWith(job)
  })

  it('reports lease loss when the fenced completion updates no row', async () => {
    const repo = repository({ complete: vi.fn().mockResolvedValue(false) })
    await expect(runWorkerOnce({ repository: repo, handler: async () => {}, workerId: 'worker-1', leaseMs: 60_000 })).resolves.toBe('lost')
  })

  it('leaves completion exceptions lease-recoverable without consuming a retry', async () => {
    const retryOrDead = vi.fn()
    const repo = repository({ complete: vi.fn().mockRejectedValue(new Error('database unavailable')), retryOrDead })
    await expect(runWorkerOnce({ repository: repo, handler: async () => {}, workerId: 'worker-1', leaseMs: 60_000 })).resolves.toBe('lost')
    expect(retryOrDead).not.toHaveBeenCalled()
  })

  it('rejects malformed tenant tuples before invoking the handler', async () => {
    const handler = vi.fn()
    const retryOrDead = vi.fn().mockResolvedValue('dead')
    const repo = repository({ validate: vi.fn().mockResolvedValue(false), retryOrDead })
    await expect(runWorkerOnce({ repository: repo, handler, workerId: 'worker-1', leaseMs: 60_000 })).resolves.toBe('dead')
    expect(handler).not.toHaveBeenCalled()
    expect(retryOrDead).toHaveBeenCalledWith(job, expect.objectContaining({ code: 'InvalidJobTupleError' }))
  })

  it('classifies lease and heartbeat loss as transient', () => {
    expect(classifyFailure(new LeaseLostError())).toMatchObject({ transient: true, failureClass: 'TRANSIENT' })
    expect(classifyFailure(new Error('heartbeat-failed'))).toMatchObject({ transient: true })
  })

  it('uses typed model-boundary codes instead of diagnostic message matching', () => {
    expect(classifyFailure(new AgentOutputValidationError())).toMatchObject({
      transient: false, code: 'AI_OUTPUT_VALIDATION_FAILED',
    })
    expect(classifyFailure(new ModelBoundaryError(
      'AI_PROVIDER_TRANSIENT', true, 'The model provider is temporarily unavailable.',
    ))).toMatchObject({ transient: true, code: 'AI_PROVIDER_TRANSIENT' })
  })

  it('delegates bounded retry/dead-letter decisions with typed failure data', async () => {
    const retryOrDead = vi.fn().mockResolvedValue('retry')
    const repo = repository({ retryOrDead })
    const result = await runWorkerOnce({
      repository: repo,
      handler: async () => { throw new Error('network timeout') },
      workerId: 'worker-1',
      leaseMs: 60_000,
    })
    expect(result).toBe('retry')
    expect(retryOrDead).toHaveBeenCalledWith(job, expect.objectContaining({ transient: true, failureClass: 'TRANSIENT' }))
  })

  it('reports exhaustion when the repository dead-letters the fenced job', async () => {
    const repo = repository({ retryOrDead: vi.fn().mockResolvedValue('dead') })
    await expect(runWorkerOnce({
      repository: repo,
      handler: async () => { throw new Error('permanent schema failure') },
      workerId: 'worker-1',
      leaseMs: 60_000,
    })).resolves.toBe('dead')
  })

  it('uses the cancellation transition and never calls completion after cancellation', async () => {
    const repo = repository()
    let published = false
    const result = await runWorkerOnce({
      repository: repo,
      handler: async () => { throw new AnalysisCancelledError(); published = true },
      workerId: 'worker-1',
      leaseMs: 60_000,
    })
    expect(result).toBe('cancelled')
    expect(published).toBe(false)
    expect(repo.complete).not.toHaveBeenCalled()
    expect(repo.cancel).toHaveBeenCalledWith(job)
  })
})

describe('durable SQL seam', () => {
  it('uses database time and distinguishes success, cancellation, and genuine exhaustion in the reaper', () => {
    const source = readFileSync(new URL('../lib/execution/job-repository.ts', import.meta.url), 'utf8')
    expect(source).toContain('NOW() + ($1 * INTERVAL')
    expect(source).toContain('run."status" = \'SUCCEEDED\' OR delivery."status" = \'processed\'')
    expect(source).toContain('run."status" = \'CANCEL_REQUESTED\'')
    expect(source).toContain('FROM failed_runs')
    expect(source).toContain('failed_running_stages AS')
    expect(source).toContain('cancelled_pending_stages AS')
    expect(source).toContain('"failureCode" = \'LeaseExpiredAfterMaxAttempts\'')
    expect(source).toContain('delivery."status" <> \'processed\'')
    const pipelineSource = readFileSync(new URL('../lib/workflows/nexus-forge-pipeline.ts', import.meta.url), 'utf8')
    expect(pipelineSource).toContain('SELECT "id" FROM "Workflow" WHERE "projectId" = ${job.projectId} FOR UPDATE')
  })
})

describe('stage checkpoint resume and publication policy', () => {
  it('resumes only completed stages with a matching immutable artifact hash', () => {
    expect(decideStageResume('SUCCEEDED', true)).toBe('resume')
    expect(decideStageResume('SKIPPED', true)).toBe('resume')
    expect(decideStageResume('SUCCEEDED', false)).toBe('invalid')
    expect(decideStageResume('FAILED', true)).toBe('execute')
  })

  it('rejects resume when any persisted stage or artifact execution identity differs', () => {
    const expected = {
      promptId: 'knowledge-distiller', promptVersion: '1', schemaVersion: '1',
      requestedProvider: 'groq', requestedModel: 'allowed-model',
    }
    const persisted = {
      promptId: expected.promptId, promptVersion: expected.promptVersion,
      agentSchemaVersion: expected.schemaVersion,
      requestedProvider: expected.requestedProvider, requestedModel: expected.requestedModel,
    }
    expect(stageIdentityMatches(persisted, expected)).toBe(true)
    for (const field of Object.keys(persisted) as Array<keyof typeof persisted>) {
      expect(stageIdentityMatches({ ...persisted, [field]: 'mismatch' }, expected)).toBe(false)
    }
    expect(decideStageResume('SUCCEEDED', stageIdentityMatches({ ...persisted, promptVersion: 'old' }, expected))).toBe('invalid')
  })

  it('preserves the prior good compatibility projection when a rerun is incomplete or failed', () => {
    expect(canPublishLegacyProjection('RUNNING', ['SUCCEEDED', 'SKIPPED', 'SUCCEEDED', 'SKIPPED', 'SUCCEEDED'])).toBe(true)
    expect(canPublishLegacyProjection('RUNNING', ['SUCCEEDED', 'SKIPPED', 'FAILED', 'SKIPPED', 'PENDING'])).toBe(false)
    expect(canPublishLegacyProjection('CANCEL_REQUESTED', ['SUCCEEDED', 'SKIPPED', 'SUCCEEDED', 'SKIPPED', 'SUCCEEDED'])).toBe(false)
  })
})

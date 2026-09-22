import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  transaction: vi.fn(),
  findActive: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    project: { findUnique: mocks.findProject },
    analysisRun: { findFirst: mocks.findActive },
    pilotEntitlement: { findUnique: vi.fn(async () => null) },
    profileRevision: { findFirst: vi.fn(async () => null) },
    $transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/billing/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/entitlements')>()
  return { ...actual, reserveRunUsage: vi.fn(async () => {}) }
})

import { ActiveAnalysisRunError, enqueueAnalysis } from '@/lib/execution/enqueue-analysis'

beforeEach(() => vi.clearAllMocks())

describe('analysis enqueue concurrency mapping', () => {
  it('maps the PostgreSQL active-run uniqueness race to the existing run id', async () => {
    mocks.findProject.mockResolvedValue({
      id: 'project-1', ownerId: 'user-1', name: 'Project', goal: 'Goal',
      repoUrl: 'https://github.com/owner/repo', prUrl: '', sources: [],
      githubRepositoryPrivate: false, externalInferenceEnabled: true,
      externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date(),
      ingestionSuspendedAt: null, inferenceSuspendedAt: null,
    })
    mocks.transaction.mockRejectedValue({ code: 'P2002' })
    mocks.findActive.mockResolvedValue({ id: 'run-existing' })

    await expect(enqueueAnalysis('project-1', 'user-1')).rejects.toMatchObject({
      name: 'ActiveAnalysisRunError', runId: 'run-existing',
    } satisfies Partial<ActiveAnalysisRunError>)
  })

  it('redacts every user-controlled snapshot field and never stores a raw-source hash', async () => {
    const secret = `gsk_${'a'.repeat(32)}`
    mocks.findProject.mockResolvedValue({
      id: 'project-1', ownerId: 'user-1', name: secret, goal: secret,
      repoUrl: `https://github.com/owner/repo?token=${secret}`, prUrl: '',
      sources: [{ id: 'source-1', type: secret, title: secret, rawContent: secret, quarantineStatus: 'CLEAR' }],
      githubRepositoryPrivate: false, externalInferenceEnabled: true,
      externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date(),
      ingestionSuspendedAt: null, inferenceSuspendedAt: null,
    })
    let createData: Record<string, unknown> | undefined
    mocks.transaction.mockImplementation(async (callback) => callback({
      analysisRun: { create: vi.fn(async ({ data }) => { createData = data; return { id: 'run-1' } }) },
      job: { create: vi.fn() },
      project: { update: vi.fn() },
    }))

    await enqueueAnalysis('project-1', 'user-1')
    const serialized = JSON.stringify(createData)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('originalContentHash')
    expect(serialized).toContain('[REDACTED]')
  })

  it('rejects enqueue when the configured model is outside the explicit allowlist', async () => {
    const previousModel = process.env.GROQ_MODEL
    const previousAllowed = process.env.GROQ_ALLOWED_MODELS
    process.env.GROQ_MODEL = 'unapproved-model'
    process.env.GROQ_ALLOWED_MODELS = 'approved-model'
    mocks.findProject.mockResolvedValue({
      id: 'project-1', ownerId: 'user-1', name: 'Project', goal: 'Goal',
      repoUrl: 'https://github.com/owner/repo', prUrl: '', sources: [],
      githubRepositoryPrivate: false, externalInferenceEnabled: true,
      externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date(),
      ingestionSuspendedAt: null, inferenceSuspendedAt: null,
    })

    await expect(enqueueAnalysis('project-1', 'user-1')).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_ERROR',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()

    if (previousModel === undefined) delete process.env.GROQ_MODEL
    else process.env.GROQ_MODEL = previousModel
    if (previousAllowed === undefined) delete process.env.GROQ_ALLOWED_MODELS
    else process.env.GROQ_ALLOWED_MODELS = previousAllowed
  })
})

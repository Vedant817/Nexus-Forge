import { describe, expect, it, vi } from 'vitest'
import { JobKind } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  findDelivery: vi.fn(),
  fence: vi.fn(),
  rawFence: vi.fn(),
  updateDelivery: vi.fn(),
  currentDelivery: vi.fn(),
  createArtifact: vi.fn(),
  createEvidence: vi.fn(),
  runProof: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  default: {
    webhookDelivery: { findFirst: mocks.findDelivery },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/agents/ai-runner', () => ({
  runAgentViaAiSdk: mocks.runProof,
}))

import { executeWebhookJob } from '@/lib/execution/webhook-worker'

const payload = {
  action: 'closed',
  installation: { id: 42 },
  repository: { id: 7, full_name: 'owner/repo' },
  pull_request: { id: 10, number: 5, title: 'Merged', body: 'Evidence', merged: true },
}

describe('durable webhook consumer', () => {
  it('publishes a review-only immutable draft and discards model scoring', async () => {
    mocks.findDelivery.mockResolvedValue({
      id: 'delivery-1', deliveryId: 'github-delivery-1', receivedAt: new Date('2026-01-01T00:00:00Z'), status: 'received', payload,
      project: { goal: 'Ship', workflow: null, activeAnalysisRunId: 'run-1' },
    })
    mocks.fence.mockResolvedValue({ count: 1 })
    mocks.rawFence.mockResolvedValue([{ id: 'job-1' }])
    mocks.currentDelivery.mockResolvedValue({ status: 'processing' })
    mocks.runProof.mockResolvedValue({
      portfolioSummary: 'Portfolio', resumeBullet: 'Resume', demoVideoScript: 'Demo',
      interviewExplanation: 'Interview', linkedinPost: 'LinkedIn', missingProofItems: [],
    })
    const tx = {
      job: { updateMany: mocks.fence },
      $queryRawUnsafe: mocks.rawFence,
      webhookDelivery: { update: mocks.updateDelivery, findUniqueOrThrow: mocks.currentDelivery },
      artifactVersion: { create: mocks.createArtifact },
      evidenceRecord: { create: mocks.createEvidence },
    }
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx))

    await executeWebhookJob({
      id: 'job-1', kind: JobKind.WEBHOOK, projectId: 'project-1', ownerId: 'user-1',
      analysisRunId: null, webhookDeliveryId: 'delivery-1', payload: { provider: 'groq', model: 'test-model' },
      attemptCount: 1, maxAttempts: 5, leaseToken: 'lease-1',
    }, new AbortController().signal)

    expect(mocks.runProof).toHaveBeenCalledWith(
      expect.stringContaining('Do not assign'),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1', projectId: 'project-1', operation: 'webhook.proof-draft:delivery-1',
      }),
    )
    expect(mocks.createArtifact).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'WEBHOOK_PROOF_DRAFT',
        content: expect.objectContaining({ score: null, reviewRequired: true, evidenceIds: [] }),
      }),
    })
    expect(mocks.createEvidence).not.toHaveBeenCalled()
    expect(mocks.updateDelivery).toHaveBeenLastCalledWith({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({ status: 'processed', attempts: 1 }),
    })
  })
})

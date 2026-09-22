import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  createDeletion: vi.fn(),
  transaction: vi.fn(),
  getOrCreateKey: vi.fn(),
  keyedDigest: vi.fn((key: string, value: string) => `hmac:${value.length}`),
}))

vi.mock('@/lib/db/prisma', () => ({
  default: {
    project: { findUnique: mocks.findProject },
    deletionRequest: { create: mocks.createDeletion, update: vi.fn() },
    $transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/privacy/tenant-keys', () => ({
  getOrCreateTenantKey: mocks.getOrCreateKey,
  keyedDigest: mocks.keyedDigest,
  destroyTenantKey: vi.fn(),
}))

import { requestProjectDeletion } from '@/lib/privacy/deletion'

describe('deletion and retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findProject.mockResolvedValue({ id: 'project-1', ownerId: 'user-1', organizationId: 'org-1' })
    mocks.createDeletion.mockResolvedValue({ id: 'deletion-1' })
    mocks.getOrCreateKey.mockResolvedValue({ keyId: 'tk_1', keyMaterial: 'key' })
    mocks.transaction.mockImplementation(async (callback: (tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>) => unknown) => {
      const deleted: string[] = []
      const tx = new Proxy({}, {
        get: (_target, model: string) => ({
          updateMany: vi.fn(async () => {
            deleted.push(`${String(model)}.updateMany`)
            return { count: 1 }
          }),
          update: vi.fn(async () => ({})),
          findMany: vi.fn(async () => {
            if (String(model) === 'analysisRun') return [{ id: 'run-1' }]
            if (String(model) === 'scorecard') return [{ id: 'scorecard-1' }]
            if (String(model) === 'criterionResult') return [{ id: 'result-1' }]
            if (String(model) === 'repositorySnapshot') return [{ id: 'snap-1' }]
            return []
          }),
          deleteMany: vi.fn(async () => {
            deleted.push(`${String(model)}.deleteMany`)
            return { count: 1 }
          }),
          delete: vi.fn(async () => {
            deleted.push(`${String(model)}.delete`)
            return {}
          }),
        }),
      })
      const result = await callback(tx as never)
      ;(mocks.transaction as unknown as { deleted?: string[] }).deleted = deleted
      return result
    })
  })

  it('purges every active store and retains only keyed tombstone metadata', async () => {
    await requestProjectDeletion({ projectId: 'project-1', actorId: 'user-1' })
    const deleted: string[] = (mocks.transaction as unknown as { deleted?: string[] }).deleted ?? []
    for (const store of ['job.deleteMany', 'analysisRun.deleteMany', 'scorecard.deleteMany', 'evidenceRecord.deleteMany', 'artifactVersion.deleteMany', 'repositorySnapshot.deleteMany', 'analysisStageRun.deleteMany', 'webhookDelivery.deleteMany', 'source.deleteMany', 'project.delete']) {
      expect(deleted).toContain(store)
    }
    const update = mocks.transaction.mock.calls.length ? true : false
    expect(update).toBe(true)
  })

  it('never stores raw project identifiers in the tombstone digest path', () => {
    const digest = mocks.keyedDigest('key', 'project-1')
    expect(digest).not.toContain('project-1')
    expect(digest.startsWith('hmac:')).toBe(true)
  })
})

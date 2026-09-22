import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class ActiveAnalysisRunError extends Error {
    constructor(public runId?: string) {
      super('An analysis run is already active for this project.')
    }
  }
  return {
    requireProjectAccess: vi.fn(),
    checkRateLimit: vi.fn(),
    enqueueAnalysis: vi.fn(),
    ActiveAnalysisRunError,
  }
})

vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@/lib/ai/inference-policy', () => ({ isInferenceEnabled: () => true }))
vi.mock('@/lib/auth/tenancy', () => ({ requireTenantAction: vi.fn(async () => ({ ok: true, role: 'OWNER' })) }))
vi.mock('@/lib/execution/enqueue-analysis', () => ({
  ActiveAnalysisRunError: mocks.ActiveAnalysisRunError,
  enqueueAnalysis: mocks.enqueueAnalysis,
}))

import { POST } from '@/app/api/projects/[id]/run-analysis/route'

describe('POST run-analysis', () => {
  beforeEach(() => {
    mocks.requireProjectAccess.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' }, projectId: 'project-1' } })
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 })
    mocks.enqueueAnalysis.mockResolvedValue({ runId: 'run-1', status: 'QUEUED' })
  })

  it('returns 202 and a durable run location without request-lifetime execution', async () => {
    const response = await POST(new Request('http://localhost/api/projects/project-1/run-analysis', { method: 'POST' }), {
      params: Promise.resolve({ id: 'project-1' }),
    })
    expect(response.status).toBe(202)
    expect(response.headers.get('location')).toBe('/api/projects/project-1/runs/run-1')
    await expect(response.json()).resolves.toEqual({ runId: 'run-1', status: 'QUEUED' })
    expect(mocks.enqueueAnalysis).toHaveBeenCalledWith('project-1', 'user-1')
  })

  it('returns the active durable run id for concurrent enqueue races', async () => {
    mocks.enqueueAnalysis.mockRejectedValueOnce(new mocks.ActiveAnalysisRunError('run-active'))
    const response = await POST(new Request('http://localhost/api/projects/project-1/run-analysis', { method: 'POST' }), {
      params: Promise.resolve({ id: 'project-1' }),
    })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ runId: 'run-active', status: 'ACTIVE' })
  })
})

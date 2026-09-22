import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  requireTenantAction: vi.fn(),
  findBaseline: vi.fn(),
  findRun: vi.fn(),
  createReview: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/auth/tenancy', () => ({ requireTenantAction: mocks.requireTenantAction }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    acceptedBaseline: { findFirst: mocks.findBaseline },
    analysisRun: { findFirst: mocks.findRun },
    artifactReview: { create: mocks.createReview },
  },
}))

import { POST } from '@/app/api/projects/[id]/reviews/route'

describe('artifact review and revision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireProjectAccess.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' } } })
    mocks.requireTenantAction.mockResolvedValue({ ok: true, role: 'OPERATOR' })
    mocks.findBaseline.mockResolvedValue({ runId: 'run-1' })
    mocks.findRun.mockResolvedValue({ id: 'run-1' })
    mocks.createReview.mockResolvedValue({ id: 'review-1' })
  })

  it('separates internal use from external export approval', async () => {
    const response = await POST(new Request('http://localhost/api/projects/p-1/reviews', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artifactKind: 'WORKFLOW', status: 'APPROVED', scope: 'external', reason: 'Ship it' }),
    }), { params: Promise.resolve({ id: 'p-1' }) })
    expect(response.status).toBe(403)
    expect(mocks.createReview).not.toHaveBeenCalled()
  })

  it('records human-attributed revisions with reasons', async () => {
    const response = await POST(new Request('http://localhost/api/projects/p-1/reviews', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artifactKind: 'WORKFLOW', status: 'CHANGES_REQUESTED', scope: 'internal', reason: 'Fix step 2' }),
    }), { params: Promise.resolve({ id: 'p-1' }) })
    expect(response.status).toBe(201)
    expect(mocks.createReview).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authorId: 'user-1', reason: 'Fix step 2' }),
    }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  findProject: vi.fn(),
  findRun: vi.fn(),
  findScorecards: vi.fn(),
}))
vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    project: { findUnique: mocks.findProject },
    analysisRun: { findFirst: mocks.findRun },
    scorecard: { findMany: mocks.findScorecards },
  },
}))

import { GET } from '@/app/api/projects/[id]/scorecards/route'

describe('GET project scorecards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireProjectAccess.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' }, projectId: 'project-1' } })
    mocks.findProject.mockResolvedValue({ activeAnalysisRunId: 'run-1' })
    mocks.findRun.mockResolvedValue({ id: 'run-1', status: 'SUCCEEDED', commitSha: null, createdAt: new Date(0) })
    mocks.findScorecards.mockResolvedValue([])
  })

  it('uses the owner-scoped active run by default', async () => {
    const response = await GET(new Request('http://localhost/api/projects/project-1/scorecards'), {
      params: Promise.resolve({ id: 'project-1' }),
    })
    expect(response.status).toBe(200)
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-1', ownerId: 'user-1' },
    }))
    expect(mocks.findRun).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-1', projectId: 'project-1', ownerId: 'user-1' },
    }))
  })

  it('does not query scorecards when project authorization fails', async () => {
    mocks.requireProjectAccess.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'Project not found' }, { status: 404 }) })
    const response = await GET(new Request('http://localhost/api/projects/other/scorecards'), {
      params: Promise.resolve({ id: 'other' }),
    })
    expect(response.status).toBe(404)
    expect(mocks.findScorecards).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }))
vi.mock('@/lib/db/prisma', () => ({ default: { project: { findFirst: mocks.findProject } } }))

import { requireProjectAccess, requireSession } from '@/lib/auth/authorization'

const headers = new Headers({ cookie: 'better-auth.session_token=test' })
const user = { id: 'user-a', name: 'Ada', email: 'ada@example.com' }

describe('authorization DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no database-backed session exists', async () => {
    mocks.getSession.mockResolvedValue(null)

    const result = await requireSession(headers)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('allows only a project owned by the authenticated user', async () => {
    mocks.getSession.mockResolvedValue({ user })
    mocks.findProject.mockResolvedValue({ id: 'project-a' })

    const result = await requireProjectAccess(headers, 'project-a')

    expect(result).toMatchObject({ ok: true, value: { projectId: 'project-a', user } })
    expect(mocks.findProject).toHaveBeenCalledWith({
      where: { id: 'project-a', ownerId: 'user-a' },
      select: { id: true },
    })
  })

  it('returns a non-enumerating 404 for a cross-user project ID', async () => {
    mocks.getSession.mockResolvedValue({ user })
    mocks.findProject.mockResolvedValue(null)

    const result = await requireProjectAccess(headers, 'project-b')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(404)
      await expect(result.response.json()).resolves.toEqual({ error: 'Project not found' })
    }
  })
})

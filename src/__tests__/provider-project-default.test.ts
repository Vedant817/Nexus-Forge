import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  findProject: vi.fn(),
  updateProjects: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    project: { findUnique: mocks.findProject, updateMany: mocks.updateProjects },
  },
}))
vi.mock('@/lib/security/audit-log', () => ({ logAudit: vi.fn(async () => {}) }))

import { PATCH } from '@/app/api/projects/[id]/route'

const baseProject = {
  repoUrl: 'https://github.com/owner/repo',
  prUrl: '',
  editRevision: 3,
  githubBindingStatus: 'unbound',
  githubRepositoryFullName: null,
}

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/projects/project-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('project model default', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.LLM_ALLOWED_MODELS
    mocks.requireProjectAccess.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' } } })
    mocks.findProject.mockResolvedValue(baseProject)
    mocks.updateProjects.mockResolvedValue({ count: 1 })
  })

  it('saves a validated provider/model default with revision increment', async () => {
    process.env.LLM_ALLOWED_MODELS = 'openai:gpt-4o-mini'
    const response = await PATCH(patchRequest({ expectedRevision: 3, llmProvider: 'openai', llmModel: 'gpt-4o-mini' }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(200)
    expect(mocks.updateProjects).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ llmProvider: 'openai', llmModel: 'gpt-4o-mini', editRevision: { increment: 1 } }),
    }))
    delete process.env.LLM_ALLOWED_MODELS
  })

  it('rejects unknown models before touching the database', async () => {
    process.env.LLM_ALLOWED_MODELS = 'openai:gpt-4o-mini'
    const response = await PATCH(patchRequest({ expectedRevision: 3, llmProvider: 'openai', llmModel: 'gpt-4o' }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(400)
    expect(mocks.updateProjects).not.toHaveBeenCalled()
    delete process.env.LLM_ALLOWED_MODELS
  })

  it('rejects half-set provider/model pairs and clears both on null', async () => {
    const half = await PATCH(patchRequest({ expectedRevision: 3, llmProvider: 'openai' }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(half.status).toBe(400)
    const cleared = await PATCH(patchRequest({ expectedRevision: 3, llmProvider: null, llmModel: null }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(cleared.status).toBe(200)
    expect(mocks.updateProjects).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ llmProvider: null, llmModel: null }),
    }))
  })
})

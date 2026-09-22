import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  findWorkflow: vi.fn(),
  updateWorkflows: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    workflow: { findUnique: mocks.findWorkflow, updateMany: mocks.updateWorkflows },
  },
}))

import { PATCH } from '@/app/api/projects/[id]/workflow/route'

const task = {
  id: 'task-1', title: 'Ship', description: 'Ship safely', status: 'planned', priority: 'high',
  reason: 'Required', acceptanceCriteria: ['Tests pass'], suggestedAgentPrompt: 'Implement', evidence: [],
}
const workflow = {
  id: 'workflow-1', projectId: 'project-1', revision: 3,
  tasksJson: JSON.stringify([task]), acceptanceCriteria: JSON.stringify(['Project works']),
  completedAcceptanceCriteria: '[]', humanState: {}, humanEdited: false, project: { activeAnalysisRunId: 'run-1' },
}

function patchRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/projects/project-1/workflow', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('workflow mutation route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireProjectAccess.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' } } })
    mocks.findWorkflow.mockResolvedValue(workflow)
    mocks.updateWorkflows.mockResolvedValue({ count: 1 })
  })

  it('returns a bounded validation error for malformed JSON', async () => {
    const response = await PATCH(patchRequest('{not-json'), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Workflow update must be valid JSON.' })
  })

  it('rejects oversized updates before database work', async () => {
    const response = await PATCH(patchRequest('{}', { 'content-length': String(256 * 1024 + 1) }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(413)
    expect(mocks.findWorkflow).not.toHaveBeenCalled()
  })

  it('stops reading an oversized body when content length is absent or dishonest', async () => {
    const response = await PATCH(patchRequest(`{"padding":"${'x'.repeat(256 * 1024)}"}`, { 'content-length': '0' }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(413)
    expect(mocks.findWorkflow).not.toHaveBeenCalled()
  })

  it('rejects malformed task state with bounded details', async () => {
    const response = await PATCH(patchRequest({ expectedRevision: 3, tasks: [{ ...task, status: 'invalid' }] }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.details.length).toBeLessThanOrEqual(10)
  })

  it('returns 409 instead of overwriting a newer revision', async () => {
    const response = await PATCH(patchRequest({ expectedRevision: 2, tasks: [task] }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ currentRevision: 3 })
    expect(mocks.updateWorkflows).not.toHaveBeenCalled()
  })

  it('stores human state with an atomic revision increment', async () => {
    const response = await PATCH(patchRequest({ expectedRevision: 3, tasks: [{ ...task, status: 'done', completedAcIndices: [0] }], completedAcceptanceCriteria: [0] }), { params: Promise.resolve({ id: 'project-1' }) })
    expect(response.status).toBe(200)
    expect(mocks.updateWorkflows).toHaveBeenCalledWith({
      where: { id: 'workflow-1', revision: 3 },
      data: {
        humanState: expect.objectContaining({ baseAnalysisRunId: 'run-1', completedAcceptanceCriteria: [0] }),
        humanEdited: true,
        revision: { increment: 1 },
      },
    })
    await expect(response.json()).resolves.toEqual({ revision: 4 })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireProjectAccess: vi.fn(),
  verifyAuthority: vi.fn(),
  verifyRepository: vi.fn(),
  createInstallationToken: vi.fn(),
  githubJson: vi.fn(),
  findState: vi.fn(),
  transaction: vi.fn(),
  advisoryLock: vi.fn(),
  findLifecycle: vi.fn(),
  consumeState: vi.fn(),
  updateProject: vi.fn(),
  createSnapshot: vi.fn(),
  deleteCookie: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({
  get: () => ({ value: 'signed-state' }),
  delete: mocks.deleteCookie,
})) }))
vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/github/onboarding-state', () => ({
  GITHUB_ONBOARDING_COOKIE: 'github-onboarding',
  verifyGitHubOnboardingToken: () => ({ stateId: 'state-1', tokenHash: 'state-hash' }),
}))
vi.mock('@/lib/github/onboarding', () => ({
  listAuthorizedGitHubRepositories: vi.fn(),
  verifyAuthorizedGitHubRepository: mocks.verifyRepository,
  verifyGitHubInstallationAuthority: mocks.verifyAuthority,
}))
vi.mock('@/lib/github/app-auth', () => ({
  createInstallationToken: mocks.createInstallationToken,
  invalidateInstallationTokens: vi.fn(),
}))
vi.mock('@/lib/github/http', () => ({ githubJson: mocks.githubJson }))
vi.mock('@/lib/security/request-origin', () => ({ hasValidRequestOrigin: () => true }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    gitHubOnboardingState: { findFirst: mocks.findState },
    gitHubInstallationLifecycle: { findUnique: mocks.findLifecycle },
    $transaction: mocks.transaction,
  },
}))

import { POST } from '@/app/api/projects/[id]/github-binding/route'

const authority = {
  installationId: '42',
  githubUserId: '7',
  account: { id: '88', login: 'octo-org', type: 'Organization' },
  repositorySelection: 'selected',
  installationPermissions: { contents: 'read', pull_requests: 'read', checks: 'read' },
  userAccessToken: 'user-token',
}

function selectionRequest(): Request {
  return new Request('http://localhost/api/projects/project-1/github-binding', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ repositoryId: '100' }),
  })
}

describe('GitHub binding finalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireProjectAccess.mockResolvedValue({ ok: true, value: { user: { id: 'user-1', sessionId: 'session-1' } } })
    mocks.findState.mockResolvedValue({ id: 'state-1', installationId: '42' })
    mocks.verifyAuthority.mockResolvedValue(authority)
    mocks.verifyRepository.mockResolvedValue({ id: '100', fullName: 'octo-org/repo', private: true, permissions: { admin: true } })
    mocks.createInstallationToken.mockResolvedValue({ token: 'installation-token' })
    mocks.githubJson.mockResolvedValue({ id: 100, full_name: 'octo-org/repo' })
    mocks.findLifecycle.mockResolvedValue(null)
    mocks.consumeState.mockResolvedValue({ count: 1 })
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.advisoryLock,
      gitHubInstallationLifecycle: { findUnique: mocks.findLifecycle },
      gitHubOnboardingState: { updateMany: mocks.consumeState },
      project: { update: mocks.updateProject },
      repositoryPermissionSnapshot: { create: mocks.createSnapshot },
    }))
  })

  it('activates only after serializing lifecycle events and consuming state once', async () => {
    const response = await POST(selectionRequest(), { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.advisoryLock).toHaveBeenCalledOnce()
    expect(mocks.consumeState).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'state-1', status: 'CALLBACK_VERIFIED' }),
      data: expect.objectContaining({ status: 'CONSUMED' }),
    }))
    expect(mocks.updateProject).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ githubBindingStatus: 'active', githubInstallationId: '42', githubRepositoryId: '100' }),
    }))
  })

  it('fails closed when a lifecycle event arrives during authority verification', async () => {
    mocks.findLifecycle.mockResolvedValueOnce(null).mockResolvedValueOnce({ revision: 1 })
    const response = await POST(selectionRequest(), { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(403)
    expect(mocks.consumeState).not.toHaveBeenCalled()
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })

  it('does not reactivate when the onboarding state was already consumed', async () => {
    mocks.consumeState.mockResolvedValue({ count: 0 })
    const response = await POST(selectionRequest(), { params: Promise.resolve({ id: 'project-1' }) })

    expect(response.status).toBe(403)
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })
})

import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  findAccounts: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ auth: { api: { getAccessToken: mocks.getAccessToken } } }))
vi.mock('@/lib/db/prisma', () => ({ default: { account: { findMany: mocks.findAccounts } } }))

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const installation = {
  id: 42,
  app_id: 12345,
  account: { id: 88, login: 'octo-org', type: 'Organization' },
  repository_selection: 'selected',
  permissions: { contents: 'read', pull_requests: 'read', checks: 'read' },
  suspended_at: null,
}

function githubFetch(options: { githubUserId?: number; includeInstallation?: boolean; suspended?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/user') return Response.json({ id: options.githubUserId ?? 7 })
    if (url.pathname === '/app') return Response.json({ id: 12345, client_id: 'github-client', slug: 'nexus-forge-test' })
    if (url.pathname === '/user/installations') {
      return Response.json({ installations: options.includeInstallation === false ? [] : [installation] })
    }
    if (url.pathname === '/app/installations/42') {
      return Response.json({ ...installation, suspended_at: options.suspended ? '2026-09-22T00:00:00Z' : null })
    }
    if (url.pathname === '/user/installations/42/repositories') {
      return Response.json({ repositories: [
        { id: 100, full_name: 'octo-org/admin-repo', private: true, permissions: { admin: true, push: true } },
        { id: 101, full_name: 'octo-org/read-only', private: true, permissions: { admin: false, pull: true } },
      ] })
    }
    throw new Error(`Unexpected GitHub request: ${url.pathname}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-at-least-thirty-two-characters'
  process.env.GITHUB_APP_ID = '12345'
  process.env.GITHUB_CLIENT_ID = 'github-client'
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
  delete process.env.GITHUB_TOKEN
  mocks.findAccounts.mockResolvedValue([{ accountId: '7' }])
  mocks.getAccessToken.mockResolvedValue({ accessToken: 'github-user-token' })
})

afterEach(() => vi.unstubAllGlobals())

describe('GitHub onboarding state', () => {
  it('signs state and rejects a modified token', async () => {
    const { createGitHubOnboardingToken, verifyGitHubOnboardingToken } = await import('@/lib/github/onboarding-state')
    const state = createGitHubOnboardingToken('123e4567-e89b-12d3-a456-426614174000')
    expect(verifyGitHubOnboardingToken(state.token)).toEqual({
      stateId: '123e4567-e89b-12d3-a456-426614174000',
      tokenHash: state.tokenHash,
    })
    const last = state.token.slice(-1)
    expect(verifyGitHubOnboardingToken(`${state.token.slice(0, -1)}${last === 'x' ? 'y' : 'x'}`)).toBeNull()
  })
})

describe('GitHub installation authority', () => {
  it('cross-checks GitHub user, App, installation, and required permissions', async () => {
    vi.stubGlobal('fetch', githubFetch())
    const { verifyGitHubInstallationAuthority } = await import('@/lib/github/onboarding')
    await expect(verifyGitHubInstallationAuthority({
      headers: new Headers({ cookie: 'session=test' }),
      nexusUserId: 'user-1',
      installationId: '42',
    })).resolves.toMatchObject({
      githubUserId: '7',
      installationId: '42',
      account: { id: '88', login: 'octo-org', type: 'Organization' },
    })
  })

  it('rejects a GitHub token for a different linked identity', async () => {
    vi.stubGlobal('fetch', githubFetch({ githubUserId: 9 }))
    const { verifyGitHubInstallationAuthority } = await import('@/lib/github/onboarding')
    await expect(verifyGitHubInstallationAuthority({ headers: new Headers(), nexusUserId: 'user-1', installationId: '42' }))
      .rejects.toThrow(/identity did not match/)
  })

  it('rejects installations missing from the signed-in user', async () => {
    vi.stubGlobal('fetch', githubFetch({ includeInstallation: false }))
    const { verifyGitHubInstallationAuthority } = await import('@/lib/github/onboarding')
    await expect(verifyGitHubInstallationAuthority({ headers: new Headers(), nexusUserId: 'user-1', installationId: '42' }))
      .rejects.toThrow(/not authorized/)
  })

  it('rejects suspended installations', async () => {
    vi.stubGlobal('fetch', githubFetch({ suspended: true }))
    const { verifyGitHubInstallationAuthority } = await import('@/lib/github/onboarding')
    await expect(verifyGitHubInstallationAuthority({ headers: new Headers(), nexusUserId: 'user-1', installationId: '42' }))
      .rejects.toThrow(/suspended/)
  })

  it('exposes only repositories where the user has administrator authority', async () => {
    vi.stubGlobal('fetch', githubFetch())
    const { listAuthorizedGitHubRepositories, verifyGitHubInstallationAuthority } = await import('@/lib/github/onboarding')
    const authority = await verifyGitHubInstallationAuthority({ headers: new Headers(), nexusUserId: 'user-1', installationId: '42' })
    await expect(listAuthorizedGitHubRepositories(authority)).resolves.toEqual([
      { id: '100', fullName: 'octo-org/admin-repo', private: true, permissions: { admin: true, push: true } },
    ])
  })

  it('rejects unsafe numeric GitHub identifiers before API use', async () => {
    const { parseGitHubId } = await import('@/lib/github/onboarding')
    expect(() => parseGitHubId('9007199254740992')).toThrow(/safe-integer/)
    expect(() => parseGitHubId('042')).toThrow(/invalid/)
  })
})

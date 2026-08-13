import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/prisma', () => ({ default: {} }))

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })

beforeEach(() => {
  process.env.GITHUB_APP_ID = '12345'
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
  delete process.env.GITHUB_TOKEN
})
afterEach(() => vi.unstubAllGlobals())

describe('GitHub App authentication', () => {
  it('creates a short-lived RS256 app JWT with clock-skew allowance', async () => {
    const { createGitHubAppJwt } = await import('@/lib/github/app-auth')
    const now = new Date('2026-01-01T00:00:00Z')
    const token = createGitHubAppJwt(now)
    const [header, payload] = token.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()))
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(payload).toMatchObject({ iss: '12345', iat: Math.floor(now.getTime() / 1000) - 60, exp: Math.floor(now.getTime() / 1000) + 540 })
  })

  it('requests a repository-scoped least-privilege installation token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'installation-secret', expires_at: '2026-01-01T01:00:00Z' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { createInstallationToken } = await import('@/lib/github/app-auth')
    await createInstallationToken({ installationId: '987', repositoryId: '654', forceRefresh: true })
    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request[1].body)
    expect(body).toEqual({ repository_ids: [654], permissions: { contents: 'read', pull_requests: 'read', checks: 'read' } })
    expect(request[1].headers.Authorization).toMatch(/^Bearer /)
  })

  it('rejects every shared personal token configuration', async () => {
    process.env.GITHUB_TOKEN = 'shared'
    const { assertGitHubAppConfigured } = await import('@/lib/github/app-auth')
    expect(() => assertGitHubAppConfigured()).toThrow(/not permitted/)
  })
})

describe('fixed-SHA repository collection', () => {
  it('pins one ref and uses its commit/tree/blob SHAs', async () => {
    const sha = 'a'.repeat(40), treeSha = 'b'.repeat(40), blobSha = 'c'.repeat(40)
    const responses = [
      new Response(JSON.stringify({ token: 'install', expires_at: '2099-01-01T00:00:00Z' }), { status: 201 }),
      new Response(JSON.stringify({ id: 77, full_name: 'owner/repo', default_branch: 'main' })),
      new Response(JSON.stringify({ object: { sha } })),
      new Response(JSON.stringify({ sha, tree: { sha: treeSha } })),
      new Response(JSON.stringify({ sha: treeSha, truncated: false, tree: [{ path: 'src/index.ts', mode: '100644', type: 'blob', sha: blobSha, size: 20 }] })),
      new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from("import './x'").toString('base64'), size: 12 })),
    ]
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!))
    vi.stubGlobal('fetch', fetchMock)
    const { collectRepositorySnapshot } = await import('@/lib/github/repository-snapshot')
    const result = await collectRepositorySnapshot({ installationId: '88', repositoryId: '77', expectedFullName: 'owner/repo' })
    expect(result).toMatchObject({ commitSha: sha, treeSha, complete: true })
    expect(result.files[0]).toMatchObject({ path: 'src/index.ts', status: 'collected', blobSha })
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([
      expect.stringContaining(`/git/commits/${sha}`), expect.stringContaining(`/git/trees/${treeSha}?recursive=1`),
    ]))
  })
})

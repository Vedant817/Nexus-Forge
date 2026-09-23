import 'server-only'

import { createPrivateKey, createSign } from 'node:crypto'

const API_VERSION = process.env.GITHUB_API_VERSION ?? '2022-11-28'

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function privateKey(): string {
  const encoded = process.env.GITHUB_APP_PRIVATE_KEY_BASE64
  const raw = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : process.env.GITHUB_APP_PRIVATE_KEY
  if (!raw) throw new Error('GitHub App private key is not configured.')
  return raw.replace(/\\n/g, '\n')
}

export function assertGitHubAppConfigured(): void {
  if (!process.env.GITHUB_APP_ID) throw new Error('GITHUB_APP_ID is required.')
  void createPrivateKey(privateKey())
  if (process.env.GITHUB_TOKEN) throw new Error('Shared GITHUB_TOKEN credentials are not permitted.')
}

export function createGitHubAppJwt(now = new Date()): string {
  assertGitHubAppConfigured()
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: process.env.GITHUB_APP_ID,
  }))
  const signingInput = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  return `${signingInput}.${signer.sign(privateKey()).toString('base64url')}`
}

export type InstallationToken = { token: string; expiresAt: Date }
const tokenCache = new Map<string, InstallationToken>()

export async function createInstallationToken(input: {
  installationId: string
  repositoryId: string
  signal?: AbortSignal
  forceRefresh?: boolean
}): Promise<InstallationToken> {
  const repositoryId = Number(input.repositoryId)
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0 || String(repositoryId) !== input.repositoryId) {
    throw new Error('GitHub repository ID is outside the supported safe-integer range.')
  }
  const key = `${input.installationId}:${input.repositoryId}:contents,pull_requests,checks`
  const cached = tokenCache.get(key)
  if (!input.forceRefresh && cached && cached.expiresAt.getTime() - Date.now() > 5 * 60_000) return cached

  const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`, {
    method: 'POST',
    signal: input.signal,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${createGitHubAppJwt()}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': process.env.APP_CODE_VERSION ? `nexus-forge/${process.env.APP_CODE_VERSION}` : 'nexus-forge/dev',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repository_ids: [repositoryId],
      permissions: { contents: 'read', pull_requests: 'read', checks: 'read' },
    }),
  })
  if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status}).`)
  const body = await response.json() as { token?: string; expires_at?: string }
  if (!body.token || !body.expires_at) throw new Error('GitHub installation token response was invalid.')
  const result = { token: body.token, expiresAt: new Date(body.expires_at) }
  tokenCache.set(key, result)
  return result
}

export function invalidateInstallationTokens(installationId: string): void {
  for (const key of tokenCache.keys()) if (key.startsWith(`${installationId}:`)) tokenCache.delete(key)
}

import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const GITHUB_ONBOARDING_COOKIE = 'nexus_forge_github_onboarding'
export const GITHUB_ONBOARDING_TTL_MS = 15 * 60_000

function signingKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET ?? ''
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters for GitHub onboarding.')
  return createHmac('sha256', secret).update('nexus-forge/github-onboarding-state/v1').digest()
}

export function hashGitHubOnboardingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createGitHubOnboardingToken(stateId: string): { token: string; tokenHash: string } {
  const nonce = randomBytes(32).toString('base64url')
  const payload = `v1.${stateId}.${nonce}`
  const signature = createHmac('sha256', signingKey()).update(payload).digest('base64url')
  const token = `${payload}.${signature}`
  return { token, tokenHash: hashGitHubOnboardingToken(token) }
}

export function verifyGitHubOnboardingToken(token: string): { stateId: string; tokenHash: string } | null {
  const [version, stateId, nonce, signature, ...rest] = token.split('.')
  if (rest.length || version !== 'v1' || !/^[0-9a-f-]{36}$/i.test(stateId ?? '') || !/^[A-Za-z0-9_-]{40,50}$/.test(nonce ?? '') || !signature) return null
  const payload = `${version}.${stateId}.${nonce}`
  const expected = createHmac('sha256', signingKey()).update(payload).digest()
  let supplied: Buffer
  try {
    supplied = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  return { stateId, tokenHash: hashGitHubOnboardingToken(token) }
}

export const githubOnboardingCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: GITHUB_ONBOARDING_TTL_MS / 1000,
  priority: 'high' as const,
}

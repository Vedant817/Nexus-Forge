import 'server-only'

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import prisma from '@/lib/db/prisma'
import { logStructured } from '@/lib/observability/logger'
import config from '@/lib/config/env'

const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

function validateProductionAuthConfig(): void {
  if (process.env.NODE_ENV !== 'production') return

  const secret = process.env.BETTER_AUTH_SECRET ?? ''
  if (secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters in production.')
  }

  const baseUrl = process.env.BETTER_AUTH_URL
  if (!baseUrl) throw new Error('BETTER_AUTH_URL is required in production.')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('BETTER_AUTH_URL must use HTTPS in production.')
  }
  if (!githubClientId || !githubClientSecret) {
    throw new Error('GitHub OAuth credentials are required in production.')
  }
}

validateProductionAuthConfig()

export const auth = betterAuth({
  appName: 'Nexus Forge',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: githubClientId && githubClientSecret
    ? {
        github: {
          clientId: githubClientId,
          clientSecret: githubClientSecret,
          // Same shape as better-auth's default GitHub mapping, plus
          // privacy-safe diagnostics: when GitHub yields no email we log only
          // booleans, counts, and HTTP statuses — never addresses or names —
          // so a failed login can be distinguished (empty account vs denied
          // scope) without touching PII.
          getUserInfo: async (token) => {
            const { diagnoseGitHubEmail, resolveGitHubEmail, toGitHubUser } = await import('@/lib/auth/github-userinfo')
            const headers = {
              'User-Agent': config.USER_AGENT,
              authorization: `Bearer ${token.accessToken}`,
            }
            const profileResponse = await fetch('https://api.github.com/user', { headers, signal: AbortSignal.timeout(10_000) })
            if (!profileResponse.ok) return null
            const profile = (await profileResponse.json()) as {
              id: number
              login?: string
              name?: string | null
              email?: string | null
              avatar_url?: string
            }
            let emailsStatus = 0
            let grantedScopes = ''
            let emails: Array<{ email?: string; primary?: boolean; verified?: boolean }> | null = null
            try {
              const emailsResponse = await fetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(10_000) })
              emailsStatus = emailsResponse.status
              // GitHub echoes the token's granted scopes here; safe to log and
              // decisive for distinguishing a scope problem from an account one.
              grantedScopes = emailsResponse.headers.get('x-oauth-scopes') ?? ''
              if (emailsResponse.ok) {
                const parsed: unknown = await emailsResponse.json()
                if (Array.isArray(parsed)) emails = parsed
              }
            } catch {
              emailsStatus = -1
            }
            const { email, emailVerified } = resolveGitHubEmail(profile, emails)
            if (!email) {
              logStructured('warn', `[auth] GitHub sign-in returned no email (granted-scopes: ${grantedScopes || 'none-reported'})`, {
                action: 'oauth-github-email',
                status: emailsStatus,
                code: diagnoseGitHubEmail(emailsStatus, emails),
              })
            }
            return toGitHubUser(profile, email, emailVerified)
          },
        },
      }
    : {},
})

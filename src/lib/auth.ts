import 'server-only'

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import prisma from '@/lib/db/prisma'

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
        },
      }
    : {},
})

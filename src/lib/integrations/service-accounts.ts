import { createHash, randomBytes } from 'node:crypto'
import prisma from '@/lib/db/prisma'

export const SERVICE_ACCOUNT_SCOPES = ['runs:read', 'runs:write', 'evidence:read', 'exports:read'] as const

export function hashServiceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createServiceAccount(input: { organizationId?: string; userId?: string; name: string; scopes: string[] }): Promise<{ id: string; token: string }> {
  const token = `nf_${randomBytes(32).toString('base64url')}`
  const account = await prisma.serviceAccount.create({
    data: { organizationId: input.organizationId, userId: input.userId, name: input.name.slice(0, 100), scopes: input.scopes as never, tokenHash: hashServiceToken(token) },
    select: { id: true },
  })
  return { id: account.id, token }
}

export async function authenticateServiceAccount(token: string): Promise<{ accountId: string; scopes: string[] } | null> {
  if (!token.startsWith('nf_')) return null
  const account = await prisma.serviceAccount.findUnique({ where: { tokenHash: hashServiceToken(token) } })
  if (!account || account.revokedAt) return null
  return { accountId: account.id, scopes: Array.isArray(account.scopes) ? (account.scopes as string[]) : [] }
}

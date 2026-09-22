import { createHmac, randomBytes } from 'node:crypto'
import prisma from '@/lib/db/prisma'

export async function getOrCreateTenantKey(organizationId: string): Promise<{ keyId: string; keyMaterial: string }> {
  const existing = await prisma.tenantKey.findUnique({ where: { organizationId } })
  if (existing && existing.keyMaterial && !existing.destroyedAt) {
    return { keyId: existing.keyId, keyMaterial: existing.keyMaterial }
  }
  const keyMaterial = randomBytes(32).toString('hex')
  const keyId = `tk_${randomBytes(8).toString('hex')}`
  await prisma.tenantKey.upsert({
    where: { organizationId },
    create: { organizationId, keyId, keyMaterial },
    update: { keyId, keyMaterial, destroyedAt: null },
  })
  return { keyId, keyMaterial }
}

export async function destroyTenantKey(organizationId: string): Promise<void> {
  await prisma.tenantKey.updateMany({
    where: { organizationId, destroyedAt: null },
    data: { keyMaterial: null, destroyedAt: new Date() },
  })
}

export function keyedDigest(keyMaterial: string, value: string): string {
  return createHmac('sha256', Buffer.from(keyMaterial, 'hex')).update(value, 'utf8').digest('hex')
}

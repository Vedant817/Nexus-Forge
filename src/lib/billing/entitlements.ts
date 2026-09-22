import prisma from '@/lib/db/prisma'

export type EffectiveEntitlement = {
  plan: string
  maxRunsPerDay: number
  maxExportsPerDay: number
  maxProjects: number
  revision: number
  expiresAt: Date | null
  suspended: boolean
  organizationId: string | null
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function getEffectiveEntitlement(input: { organizationId?: string | null; userId: string }): Promise<EffectiveEntitlement> {
  if (input.organizationId) {
    const row = await prisma.pilotEntitlement.findUnique({ where: { organizationId: input.organizationId } })
    if (row) {
      return { plan: row.plan, maxRunsPerDay: row.maxRunsPerDay, maxExportsPerDay: row.maxExportsPerDay, maxProjects: row.maxProjects, revision: row.revision, expiresAt: row.expiresAt, suspended: row.suspended, organizationId: row.organizationId }
    }
  }
  const personal = await prisma.pilotEntitlement.findUnique({ where: { userId: input.userId } })
  if (personal) {
    return { plan: personal.plan, maxRunsPerDay: personal.maxRunsPerDay, maxExportsPerDay: personal.maxExportsPerDay, maxProjects: personal.maxProjects, revision: personal.revision, expiresAt: personal.expiresAt, suspended: personal.suspended, organizationId: personal.organizationId }
  }
  return { plan: 'pilot', maxRunsPerDay: 10, maxExportsPerDay: 50, maxProjects: 50, revision: 0, expiresAt: null, suspended: false, organizationId: input.organizationId ?? null }
}

export function assertEntitlementActive(entitlement: EffectiveEntitlement): void {
  if (entitlement.suspended) throw new Error('Pilot entitlement is suspended.')
  if (entitlement.expiresAt && entitlement.expiresAt.getTime() <= Date.now()) throw new Error('Pilot entitlement has expired.')
}

export async function reserveRunUsage(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], input: { organizationId?: string | null; userId: string; maxRunsPerDay: number }): Promise<void> {
  const periodStart = startOfUtcDay()
  const where = { organizationId: input.organizationId ?? '', userId: input.organizationId ? '' : input.userId, periodStart }
  const existing = await tx.entitlementUsage.findUnique({ where: { organizationId_userId_periodStart: where } })
  const used = existing?.runsUsed ?? 0
  if (used >= input.maxRunsPerDay) throw new Error('Daily run allowance exhausted for this pilot.')
  if (existing) {
    await tx.entitlementUsage.update({ where: { id: existing.id }, data: { runsUsed: { increment: 1 } } })
  } else {
    await tx.entitlementUsage.create({ data: { ...where, runsUsed: 1 } })
  }
}

export async function reserveExportUsage(input: { organizationId?: string | null; userId: string }): Promise<void> {
  const entitlement = await getEffectiveEntitlement(input)
  assertEntitlementActive(entitlement)
  const periodStart = startOfUtcDay()
  const key = { organizationId: entitlement.organizationId ?? '', userId: entitlement.organizationId ? '' : input.userId, periodStart }
  const existing = await prisma.entitlementUsage.findUnique({ where: { organizationId_userId_periodStart: key } })
  if ((existing?.exportsUsed ?? 0) >= entitlement.maxExportsPerDay) throw new Error('Daily export allowance exhausted for this pilot.')
  if (existing) {
    await prisma.entitlementUsage.update({ where: { id: existing.id }, data: { exportsUsed: { increment: 1 } } })
  } else {
    await prisma.entitlementUsage.create({ data: { ...key, exportsUsed: 1 } })
  }
}

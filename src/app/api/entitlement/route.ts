import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { getEffectiveEntitlement } from '@/lib/billing/entitlements'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const membership = await prisma.membership.findFirst({ where: { userId: session.value.id }, select: { organizationId: true } })
  const entitlement = await getEffectiveEntitlement({ organizationId: membership?.organizationId ?? null, userId: session.value.id })
  return NextResponse.json({
    plan: entitlement.plan,
    revision: entitlement.revision,
    maxRunsPerDay: entitlement.maxRunsPerDay,
    maxExportsPerDay: entitlement.maxExportsPerDay,
    maxProjects: entitlement.maxProjects,
    expiresAt: entitlement.expiresAt,
    suspended: entitlement.suspended,
  })
}

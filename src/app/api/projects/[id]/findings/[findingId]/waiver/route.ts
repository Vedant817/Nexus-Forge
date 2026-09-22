import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const waiverSchema = z.object({
  reason: z.string().min(10).max(2000),
  scope: z.string().max(100).default('criterion'),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'policy_exception')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = waiverSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'A waiver reason of at least 10 characters is required.' }, { status: 400 })
  const finding = await prisma.finding.findFirst({ where: { id: findingId, projectId: id } })
  if (!finding) return NextResponse.json({ error: 'Finding not found.' }, { status: 404 })
  const waiver = await prisma.$transaction(async (tx) => {
    const created = await tx.findingWaiver.create({
      data: { findingId, reason: parsed.data.reason.slice(0, 2000), approverId: access.value.user.id, scope: parsed.data.scope, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null },
    })
    await tx.finding.update({ where: { id: findingId }, data: { status: 'WAIVED' } })
    return created
  })
  await logAudit('approval_decision', `Finding waiver approved`, id, { actorId: access.value.user.id, targetId: findingId })
  return NextResponse.json(waiver, { status: 201 })
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const resolveSchema = z.object({ commitSha: z.string().regex(/^[0-9a-f]{40}$/i) }).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'accept_baseline')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = resolveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Resolution must pin a 40-character commit SHA.' }, { status: 400 })
  const finding = await prisma.finding.findFirst({ where: { id: findingId, projectId: id } })
  if (!finding) return NextResponse.json({ error: 'Finding not found.' }, { status: 404 })
  const evidence = await prisma.evidenceRecord.findFirst({ where: { projectId: id, commitSha: parsed.data.commitSha.toLowerCase() }, select: { id: true } })
  if (!evidence) return NextResponse.json({ error: 'No deterministic evidence at the pinned commit.' }, { status: 400 })
  const resolution = await prisma.$transaction(async (tx) => {
    const created = await tx.findingResolution.create({ data: { findingId, commitSha: parsed.data.commitSha.toLowerCase(), verifierId: access.value.user.id } })
    await tx.finding.update({ where: { id: findingId }, data: { status: 'RESOLVED' } })
    return created
  })
  await logAudit('approval_decision', 'Finding resolved with pinned evidence', id, { actorId: access.value.user.id, targetId: findingId })
  return NextResponse.json(resolution, { status: 201 })
}

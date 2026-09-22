import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { FINDING_STATUSES } from '@/lib/pilot/findings'
import { logAudit } from '@/lib/security/audit-log'

const upsertSchema = z.object({
  criterionId: z.string().min(1).max(200),
  status: z.enum(FINDING_STATUSES).optional(),
  ownerId: z.string().max(100).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  evidenceIds: z.array(z.string().min(1).max(200)).max(20).optional(),
  externalIssue: z.string().max(500).nullable().optional(),
  comment: z.string().max(2000).optional(),
}).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const findings = await prisma.finding.findMany({
    where: { projectId: id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { waivers: { orderBy: { createdAt: 'desc' }, take: 1 }, resolutions: { orderBy: { verifiedAt: 'desc' }, take: 1 } },
  })
  return NextResponse.json({ findings })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'accept_baseline')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid finding update.' }, { status: 400 })
  const finding = await prisma.finding.upsert({
    where: { projectId_criterionId: { projectId: id, criterionId: parsed.data.criterionId } },
    create: {
      projectId: id, criterionId: parsed.data.criterionId, status: parsed.data.status ?? 'OPEN',
      ownerId: parsed.data.ownerId ?? undefined, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      evidenceIds: (parsed.data.evidenceIds ?? []) as never, externalIssue: parsed.data.externalIssue ?? undefined,
    },
    update: {
      status: parsed.data.status ?? undefined, ownerId: parsed.data.ownerId ?? undefined,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      evidenceIds: (parsed.data.evidenceIds ?? undefined) as never, externalIssue: parsed.data.externalIssue ?? undefined,
    },
  })
  if (parsed.data.comment) {
    await prisma.findingComment.create({ data: { findingId: finding.id, authorId: access.value.user.id, body: parsed.data.comment.slice(0, 2000) } })
  }
  await logAudit('approval_decision', `Finding ${parsed.data.criterionId} triaged`, id, { actorId: access.value.user.id, targetId: parsed.data.criterionId })
  return NextResponse.json(finding, { status: 201 })
}

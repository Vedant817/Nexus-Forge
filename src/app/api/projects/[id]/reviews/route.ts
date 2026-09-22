import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const reviewSchema = z.object({
  artifactKind: z.enum(['WORKFLOW', 'RELEASE', 'PROOF', 'KNOWLEDGE']),
  status: z.enum(['DRAFT', 'CHANGES_REQUESTED', 'APPROVED', 'SUPERSEDED', 'REJECTED']),
  scope: z.enum(['internal', 'external']).default('internal'),
  reason: z.string().max(2000).default(''),
}).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const reviews = await prisma.artifactReview.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 50 })
  const baseline = await prisma.acceptedBaseline.findFirst({ where: { projectId: id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({
    reviews: reviews.map((review) => ({
      ...review,
      stale: baseline && review.baselineRunId && review.baselineRunId !== baseline.runId,
    })),
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'accept_baseline')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review decision.' }, { status: 400 })
  if (parsed.data.scope === 'external' && parsed.data.status === 'APPROVED' && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
    return NextResponse.json({ error: 'External approval requires an Owner or Admin.' }, { status: 403 })
  }
  const baseline = await prisma.acceptedBaseline.findFirst({ where: { projectId: id }, orderBy: { createdAt: 'desc' } })
  const review = await prisma.artifactReview.create({
    data: {
      projectId: id, artifactKind: parsed.data.artifactKind, status: parsed.data.status,
      scope: parsed.data.scope, reason: parsed.data.reason.slice(0, 2000),
      authorId: access.value.user.id, baselineRunId: baseline?.runId,
    },
  })
  await logAudit('approval_decision', `Artifact ${parsed.data.artifactKind} ${parsed.data.status}`, id, { actorId: access.value.user.id, targetId: parsed.data.artifactKind })
  return NextResponse.json(review, { status: 201 })
}

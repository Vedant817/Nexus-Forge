import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const acceptSchema = z.object({ runId: z.string().min(1).max(100) }).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const baseline = await prisma.acceptedBaseline.findFirst({ where: { projectId: id }, orderBy: { createdAt: 'desc' } })
  const schedule = await prisma.pilotSchedule.findUnique({ where: { projectId: id } })
  const digests = await prisma.baselineDigest.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 5 })
  return NextResponse.json({ baseline, schedule, digests })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'accept_baseline')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = acceptSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid baseline selection.' }, { status: 400 })
  const run = await prisma.analysisRun.findFirst({ where: { id: parsed.data.runId, projectId: id, status: 'SUCCEEDED' }, select: { id: true } })
  if (!run) return NextResponse.json({ error: 'Only successful runs can be accepted as baselines.' }, { status: 400 })
  const baseline = await prisma.acceptedBaseline.create({ data: { projectId: id, runId: run.id, actorId: access.value.user.id } })
  await logAudit('approval_decision', 'Baseline accepted', id, { actorId: access.value.user.id, targetId: run.id })
  return NextResponse.json(baseline, { status: 201 })
}

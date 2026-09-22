import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { reserveExportUsage } from '@/lib/billing/entitlements'
import { logAudit } from '@/lib/security/audit-log'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'export_sensitive')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const rateCheck = await checkRateLimit(`export:user:${access.value.user.id}`, { windowMs: 60_000, maxRequests: 20 })
  if (!rateCheck.allowed) return NextResponse.json({ error: 'Export rate limit exceeded.' }, { status: 429 })
  const project = await prisma.project.findUnique({ where: { id }, select: { organizationId: true } })
  try {
    await reserveExportUsage({ organizationId: project?.organizationId ?? null, userId: access.value.user.id })
  } catch {
    return NextResponse.json({ error: 'Daily export allowance exhausted for this pilot.' }, { status: 409 })
  }
  const runId = new URL(request.url).searchParams.get('runId')
  const run = runId
    ? await prisma.analysisRun.findFirst({ where: { id: runId, projectId: id } })
    : await prisma.analysisRun.findFirst({ where: { projectId: id, status: 'SUCCEEDED' }, orderBy: { createdAt: 'desc' } })
  if (!run) return NextResponse.json({ error: 'No evidence bundle available.' }, { status: 404 })
  const [evidence, scorecards] = await Promise.all([
    prisma.evidenceRecord.findMany({ where: { analysisRunId: run.id }, orderBy: { stableEvidenceId: 'asc' } }),
    prisma.scorecard.findMany({ where: { analysisRunId: run.id }, include: { criterionResults: true } }),
  ])
  await logAudit('export_generated', 'Evidence bundle exported', id, { actorId: access.value.user.id, targetId: run.id })
  return NextResponse.json({ runId: run.id, manifest: run.admissionManifest, manifestDigest: run.admissionDigest, evidence, scorecards })
}

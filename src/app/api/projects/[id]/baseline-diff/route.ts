import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { diffCriteria, diffFingerprints } from '@/lib/pilot/baseline-diff'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const runId = new URL(request.url).searchParams.get('runId')
  if (!runId) return NextResponse.json({ error: 'runId is required.' }, { status: 400 })
  const baseline = await prisma.acceptedBaseline.findFirst({ where: { projectId: id }, orderBy: { createdAt: 'desc' } })
  if (!baseline) return NextResponse.json({ error: 'No accepted baseline.' }, { status: 404 })
  const [baselineEvidence, currentEvidence] = await Promise.all([
    prisma.evidenceRecord.findMany({ where: { analysisRunId: baseline.runId }, select: { stableEvidenceId: true, contentHash: true } }),
    prisma.evidenceRecord.findMany({ where: { analysisRunId: runId, projectId: id }, select: { stableEvidenceId: true, contentHash: true } }),
  ])
  if (!currentEvidence.length) return NextResponse.json({ error: 'Run not found.' }, { status: 404 })
  const evidenceDiff = diffFingerprints(baselineEvidence, currentEvidence, (entry) => entry.stableEvidenceId)
  const [baselineCriteria, currentCriteria] = await Promise.all([
    prisma.criterionResult.findMany({ where: { scorecard: { analysisRunId: baseline.runId } }, select: { criterionId: true, status: true } }),
    prisma.criterionResult.findMany({ where: { scorecard: { analysisRunId: runId } }, select: { criterionId: true, status: true } }),
  ])
  const criteriaDiff = diffCriteria(baselineCriteria, currentCriteria)
  const digest = await prisma.baselineDigest.upsert({
    where: { projectId_runId: { projectId: id, runId } },
    create: { projectId: id, runId, baselineRunId: baseline.runId, additions: evidenceDiff.additions, removals: evidenceDiff.removals, statusChanges: criteriaDiff.statusChanges, unknowns: criteriaDiff.unknowns },
    update: {},
  })
  return NextResponse.json({ baselineRunId: baseline.runId, ...evidenceDiff, ...criteriaDiff, digestId: digest.id })
}

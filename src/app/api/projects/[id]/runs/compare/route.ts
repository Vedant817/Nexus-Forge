import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { diffCriteria, diffFingerprints } from '@/lib/pilot/baseline-diff'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const url = new URL(request.url)
  const fromId = url.searchParams.get('from')
  const toId = url.searchParams.get('to')
  if (!fromId || !toId) return NextResponse.json({ error: 'from and to run IDs are required.' }, { status: 400 })
  const [from, to] = await Promise.all([
    prisma.analysisRun.findFirst({ where: { id: fromId, projectId: id, ownerId: access.value.user.id } }),
    prisma.analysisRun.findFirst({ where: { id: toId, projectId: id, ownerId: access.value.user.id } }),
  ])
  if (!from || !to) return NextResponse.json({ error: 'Run not found.' }, { status: 404 })
  const explanations: string[] = []
  if (from.inputHash !== to.inputHash) explanations.push('Inputs differ between runs.')
  if (from.pipelineVersion !== to.pipelineVersion || from.modelConfigVersion !== to.modelConfigVersion) explanations.push('Pipeline or model versions differ.')
  if (JSON.stringify(from.admissionManifest) !== JSON.stringify(to.admissionManifest)) explanations.push('Admission policy or profile differs.')
  const [fromEvidence, toEvidence] = await Promise.all([
    prisma.evidenceRecord.findMany({ where: { analysisRunId: fromId }, select: { stableEvidenceId: true, contentHash: true } }),
    prisma.evidenceRecord.findMany({ where: { analysisRunId: toId }, select: { stableEvidenceId: true, contentHash: true } }),
  ])
  const evidenceDiff = diffFingerprints(fromEvidence, toEvidence, (entry) => entry.stableEvidenceId)
  const [fromCriteria, toCriteria] = await Promise.all([
    prisma.criterionResult.findMany({ where: { scorecard: { analysisRunId: fromId } }, select: { criterionId: true, status: true } }),
    prisma.criterionResult.findMany({ where: { scorecard: { analysisRunId: toId } }, select: { criterionId: true, status: true } }),
  ])
  const criteriaDiff = diffCriteria(fromCriteria, toCriteria)
  if (!evidenceDiff.additions.length && !evidenceDiff.removals.length && !criteriaDiff.statusChanges.length) {
    explanations.push('No evidence or criterion differences; score changes, if any, come from completeness or policy layers.')
  }
  return NextResponse.json({ from: fromId, to: toId, explanations, ...evidenceDiff, ...criteriaDiff })
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { exportProofPackMarkdown } from '@/lib/export/markdown'
import { logAudit } from '@/lib/security/audit-log'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const [proof, project] = await Promise.all([
      prisma.proofPack.findUnique({ where: { projectId: id } }),
      prisma.project.findUnique({ where: { id, ownerId: access.value.user.id }, select: { activeAnalysisRunId: true } }),
    ])
    if (!proof) return NextResponse.json({ error: 'No proof pack found' }, { status: 404 })
    const scorecard = project?.activeAnalysisRunId ? await prisma.scorecard.findUnique({
      where: { analysisRunId_kind_version: {
        analysisRunId: project.activeAnalysisRunId,
        kind: 'PROOF_COMPLETENESS',
        version: proof.scorecardVersion,
      } },
      include: { criterionResults: { include: { evidenceLinks: { include: { evidenceRecord: { select: { stableEvidenceId: true } } } } } } },
    }) : null

    const output = exportProofPackMarkdown({
      portfolioSummary: proof.portfolioSummary,
      resumeBullet: proof.resumeBullet,
      demoVideoScript: proof.demoVideoScript,
      interviewExplanation: proof.interviewExplanation,
      linkedinPost: proof.linkedinPost,
      missingProofItems: JSON.parse(proof.missingProofItems),
    }, scorecard ? {
      score: scorecard.score,
      completenessRatio: scorecard.completenessRatio,
      version: scorecard.version,
      evidenceIds: [...new Set(scorecard.criterionResults.flatMap((result) =>
        result.evidenceLinks.map((link) => link.evidenceRecord.stableEvidenceId),
      ))],
    } : undefined)

    await logAudit('export_generated', 'Proof pack markdown exported', id)

    return new NextResponse(output, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="proof-pack.md"',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to export proof pack' }, { status: 500 })
  }
}

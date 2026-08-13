import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'

const querySchema = z.object({
  runId: z.string().min(1).max(100).optional(),
  kind: z.enum(['REPOSITORY_MATURITY', 'RELEASE_READINESS', 'PROOF_COMPLETENESS']).optional(),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    runId: url.searchParams.get('runId') ?? undefined,
    kind: url.searchParams.get('kind') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid scorecard query' }, { status: 400 })

  const active = parsed.data.runId ? null : await prisma.project.findUnique({
    where: { id, ownerId: access.value.user.id },
    select: { activeAnalysisRunId: true },
  })
  const runId = parsed.data.runId ?? active?.activeAnalysisRunId
  if (!runId) return NextResponse.json({ runId: null, scorecards: [] })
  const run = await prisma.analysisRun.findFirst({
    where: { id: runId, projectId: id, ownerId: access.value.user.id },
    select: { id: true, status: true, commitSha: true, createdAt: true },
  })
  if (!run) return NextResponse.json({ error: 'Analysis run not found' }, { status: 404 })

  const scorecards = await prisma.scorecard.findMany({
    where: { analysisRunId: run.id, projectId: id, kind: parsed.data.kind },
    orderBy: { kind: 'asc' },
    include: {
      criterionResults: {
        orderBy: { criterionId: 'asc' },
        include: {
          evidenceLinks: {
            include: {
              evidenceRecord: {
                select: {
                  stableEvidenceId: true, evidenceType: true, source: true,
                  collectorId: true, collectorVersion: true, observedAt: true,
                  repositoryFullName: true, commitSha: true, path: true,
                  lineStart: true, lineEnd: true, checkId: true,
                  contentHash: true, facts: true, provenance: true, confidence: true,
                },
              },
            },
          },
        },
      },
    },
  })

  return NextResponse.json({ run, scorecards })
}

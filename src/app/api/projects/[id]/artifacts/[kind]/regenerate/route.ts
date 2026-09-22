import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { getAgentRunner } from '@/lib/agents/ai-runner'
import { contentHash } from '@/lib/execution/hash'

const KINDS = ['WORKFLOW', 'RELEASE', 'PROOF', 'KNOWLEDGE'] as const

export async function POST(request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return NextResponse.json({ error: 'Unknown artifact kind.' }, { status: 400 })
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'create_run')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const run = await prisma.analysisRun.findFirst({ where: { projectId: id, ownerId: access.value.user.id, status: 'SUCCEEDED' }, orderBy: { createdAt: 'desc' } })
  if (!run) return NextResponse.json({ error: 'No successful run to regenerate from.' }, { status: 400 })
  if (!run.ledgerSealedAt) return NextResponse.json({ error: 'Sealed baseline is required before regeneration.' }, { status: 400 })
  const [workflow, knowledge] = await Promise.all([
    prisma.workflow.findUnique({ where: { projectId: id } }),
    prisma.knowledgeSummary.findUnique({ where: { projectId: id } }),
  ])
  const runner = getAgentRunner()
  const context = { userId: access.value.user.id, projectId: id, operation: `artifact.regenerate:${kind}:${run.id}` }
  let content: unknown
  if (kind === 'WORKFLOW') {
    content = await runner.runWorkflowPlanner({
      projectGoal: 'Regenerate workflow from sealed evidence',
      knowledgeSummary: { mainTopic: knowledge?.mainTopic ?? '', keyConcepts: [], implementationPatterns: [], buildableTasks: [], warningsOrPitfalls: [], termsToUnderstand: [], sourceEvidence: [], recommendedNextAction: '' },
      evidenceIds: [],
    }, context)
  } else if (kind === 'RELEASE') {
    content = await runner.runReleaseReadiness({ prUrl: undefined, prDiff: '', changedFiles: [], workflowAcceptanceCriteria: [], repoAnalysis: undefined }, context)
  } else if (kind === 'PROOF') {
    content = await runner.runProofOfWork({
      projectGoal: 'Regenerate proof draft', workflowOutput: { workflowTitle: workflow?.title ?? '', objective: workflow?.objective ?? '', tasks: [], acceptanceCriteria: [], testPlan: '', suggestedAgentPrompts: [], expectedFilesToChange: [], reviewChecklist: [] },
      finalSummary: 'Regenerated candidate',
    }, context)
  } else {
    content = await runner.runKnowledgeDistiller({ sources: [] }, context)
  }
  const existing = await prisma.artifactVersion.findMany({ where: { analysisRunId: run.id, kind }, select: { schemaVersion: true } })
  const version = Math.max(1, ...existing.map((row) => row.schemaVersion)) + 1
  const candidate = await prisma.artifactVersion.create({
    data: {
      projectId: id, analysisRunId: run.id, kind, schemaVersion: version,
      content: content as never, contentHash: contentHash(content),
    },
  })
  return NextResponse.json({ candidateId: candidate.id, schemaVersion: version, runId: run.id }, { status: 201 })
}

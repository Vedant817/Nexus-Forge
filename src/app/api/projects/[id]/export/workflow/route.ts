import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { exportWorkflowMarkdown } from '@/lib/export/markdown'
import { logAudit } from '@/lib/security/audit-log'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { resolveWorkflowState } from '@/lib/workflows/workflow-state'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const { checkRateLimit } = await import('@/lib/security/rate-limit')
  const rateCheck = await checkRateLimit(`export:user:${access.value.user.id}`, { windowMs: 60_000, maxRequests: 20 })
  if (!rateCheck.allowed) return NextResponse.json({ error: 'Export rate limit exceeded.' }, { status: 429 })

  try {
    const workflow = await prisma.workflow.findUnique({ where: { projectId: id }, include: { project: { select: { activeAnalysisRunId: true } } } })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })

    const state = resolveWorkflowState(workflow, workflow.project.activeAnalysisRunId)
    const output = exportWorkflowMarkdown({
      workflowTitle: workflow.title,
      objective: workflow.objective,
      tasks: state.tasks.map((task) => ({ ...task, evidence: task.evidence ?? [] })),
      acceptanceCriteria: state.acceptanceCriteria,
      completedAcceptanceCriteria: state.completedAcceptanceCriteria,
      testPlan: workflow.testPlan,
      suggestedAgentPrompts: [],
      expectedFilesToChange: JSON.parse(workflow.expectedFiles),
      reviewChecklist: JSON.parse(workflow.reviewChecklist),
    })

    await logAudit('export_generated', 'Workflow markdown exported', id)

    return new NextResponse(output, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="workflow.md"',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to export workflow' }, { status: 500 })
  }
}

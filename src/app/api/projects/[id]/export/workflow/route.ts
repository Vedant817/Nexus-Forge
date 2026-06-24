import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { exportWorkflowMarkdown } from '@/lib/export/markdown'
import { logAudit } from '@/lib/security/audit-log'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const workflow = await prisma.workflow.findUnique({ where: { projectId: id } })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })

    const tasks = JSON.parse(workflow.tasksJson)
    const output = exportWorkflowMarkdown({
      workflowTitle: workflow.title,
      objective: workflow.objective,
      tasks,
      acceptanceCriteria: JSON.parse(workflow.acceptanceCriteria),
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

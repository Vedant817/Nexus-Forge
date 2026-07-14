import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { exportWorkflowMarkdown } from '@/lib/export/markdown'
import { logAudit } from '@/lib/security/audit-log'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const workflow = await prisma.workflow.findUnique({ where: { projectId: id } })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })

    const tasks = asArray<import("@/types").WorkflowTask>(workflow.tasksJson)
    const output = exportWorkflowMarkdown({
      workflowTitle: workflow.title,
      objective: workflow.objective,
      tasks,
      acceptanceCriteria: asArray<string>(workflow.acceptanceCriteria),
      testPlan: workflow.testPlan,
      suggestedAgentPrompts: [],
      expectedFilesToChange: asArray<string>(workflow.expectedFiles),
      reviewChecklist: asArray<string>(workflow.reviewChecklist),
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

function asArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try { return JSON.parse(value) as T[] } catch { return [] }
}

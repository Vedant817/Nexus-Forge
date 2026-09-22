import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { resolveWorkflowState, workflowMutationSchema } from '@/lib/workflows/workflow-state'

const MAX_WORKFLOW_MUTATION_BYTES = 256 * 1024

async function readMutation(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WORKFLOW_MUTATION_BYTES) {
    return { ok: false, response: NextResponse.json({ error: 'Workflow update exceeds 256 KiB.' }, { status: 413 }) }
  }
  if (!request.body) return { ok: false, response: NextResponse.json({ error: 'Workflow update must be valid JSON.' }, { status: 400 }) }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_WORKFLOW_MUTATION_BYTES) {
        await reader.cancel('Workflow update exceeded the request limit.')
        return { ok: false, response: NextResponse.json({ error: 'Workflow update exceeds 256 KiB.' }, { status: 413 }) }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length).toString('utf8')
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Workflow update must be valid JSON.' }, { status: 400 }) }
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { projectId: id },
      include: { project: { select: { activeAnalysisRunId: true } } },
    })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })
    const state = resolveWorkflowState(workflow, workflow.project.activeAnalysisRunId)
    return NextResponse.json({
      id: workflow.id,
      projectId: workflow.projectId,
      title: workflow.title,
      objective: workflow.objective,
      testPlan: workflow.testPlan,
      expectedFiles: workflow.expectedFiles,
      reviewChecklist: workflow.reviewChecklist,
      rawOutput: workflow.rawOutput,
      revision: workflow.revision,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      tasksJson: JSON.stringify(state.tasks),
      acceptanceCriteria: JSON.stringify(state.acceptanceCriteria),
      completedAcceptanceCriteria: JSON.stringify(state.completedAcceptanceCriteria),
      overlayBaseAnalysisRunId: state.overlayBaseAnalysisRunId,
      generatedUpdateAvailable: state.generatedUpdateAvailable,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const body = await readMutation(request)
  if (!body.ok) return body.response
  const parsed = workflowMutationSchema.safeParse(body.value)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid workflow update.', details: parsed.error.issues.slice(0, 10) }, { status: 400 })
  }

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { projectId: id },
      include: { project: { select: { activeAnalysisRunId: true } } },
    })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })
    if (parsed.data.expectedRevision !== workflow.revision) {
      return NextResponse.json({ error: 'Workflow changed in another session. Reload before saving.', currentRevision: workflow.revision }, { status: 409 })
    }
    if (parsed.data.adoptGenerated) {
      const adopted = await prisma.workflow.updateMany({
        where: { id: workflow.id, revision: workflow.revision },
        data: { humanState: {}, humanEdited: false, revision: { increment: 1 } },
      })
      if (adopted.count !== 1) return NextResponse.json({ error: 'Workflow changed in another session. Reload before saving.' }, { status: 409 })
      return NextResponse.json({ revision: workflow.revision + 1 })
    }

    const current = resolveWorkflowState(workflow, workflow.project.activeAnalysisRunId)
    const tasks = parsed.data.tasks ?? current.tasks
    const completed = parsed.data.completedAcceptanceCriteria ?? current.completedAcceptanceCriteria
    if (completed.some((index) => index >= current.acceptanceCriteria.length) || new Set(completed).size !== completed.length) {
      return NextResponse.json({ error: 'Completed project criteria must be unique valid indices.' }, { status: 400 })
    }
    const humanState = {
      version: 1,
      baseAnalysisRunId: current.overlayBaseAnalysisRunId ?? workflow.project.activeAnalysisRunId,
      tasks,
      acceptanceCriteria: current.acceptanceCriteria,
      completedAcceptanceCriteria: completed,
    }
    const updated = await prisma.workflow.updateMany({
      where: { id: workflow.id, revision: workflow.revision },
      data: { humanState, humanEdited: true, revision: { increment: 1 } },
    })
    if (updated.count !== 1) return NextResponse.json({ error: 'Workflow changed in another session. Reload before saving.' }, { status: 409 })
    return NextResponse.json({ revision: workflow.revision + 1 })
  } catch {
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}

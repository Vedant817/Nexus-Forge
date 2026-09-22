import { z } from 'zod'

export const workflowBoardTaskSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  description: z.string().max(10_000),
  status: z.enum(['planned', 'in_progress', 'needs_review', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  reason: z.string().max(5_000),
  acceptanceCriteria: z.array(z.string().min(1).max(2_000)).max(50),
  completedAcIndices: z.array(z.number().int().nonnegative()).max(50).optional(),
  suggestedAgentPrompt: z.string().max(20_000),
  evidence: z.array(z.string().max(500)).max(100).optional(),
}).strict().superRefine((task, context) => {
  const completed = task.completedAcIndices ?? []
  if (new Set(completed).size !== completed.length || completed.some((index) => index >= task.acceptanceCriteria.length)) {
    context.addIssue({ code: 'custom', path: ['completedAcIndices'], message: 'Completed task criteria must be unique valid indices.' })
  }
})

export const workflowMutationSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  tasks: z.array(workflowBoardTaskSchema).max(200).optional(),
  completedAcceptanceCriteria: z.array(z.number().int().nonnegative()).max(200).optional(),
  adoptGenerated: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  const mutations = Number(value.tasks !== undefined) + Number(value.completedAcceptanceCriteria !== undefined) + Number(value.adoptGenerated === true)
  if (mutations === 0) context.addIssue({ code: 'custom', message: 'At least one workflow change is required.' })
  if (value.adoptGenerated && mutations !== 1) context.addIssue({ code: 'custom', message: 'Generated workflow adoption must be a separate change.' })
  if (value.tasks) {
    const ids = value.tasks.map((task) => task.id)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['tasks'], message: 'Workflow task IDs must be unique.' })
  }
})

export type WorkflowBoardTask = z.infer<typeof workflowBoardTaskSchema>

const workflowHumanStateSchema = z.object({
  version: z.literal(1),
  baseAnalysisRunId: z.string().nullable(),
  tasks: z.array(workflowBoardTaskSchema).max(200),
  acceptanceCriteria: z.array(z.string().min(1).max(2_000)).max(200),
  completedAcceptanceCriteria: z.array(z.number().int().nonnegative()).max(200),
}).strict()

type WorkflowStorage = {
  tasksJson: string
  acceptanceCriteria: string
  completedAcceptanceCriteria: string
  humanState: unknown
  humanEdited?: boolean
}

function parseArray<T>(value: string, schema: z.ZodType<T[]>): T[] {
  try {
    const parsed = schema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function validCompletedIndices(indices: number[], length: number): number[] {
  return [...new Set(indices)].filter((index) => index >= 0 && index < length).sort((a, b) => a - b)
}

export function generatedWorkflowState(workflow: WorkflowStorage) {
  const tasks = parseArray(workflow.tasksJson, z.array(workflowBoardTaskSchema).max(200))
  const acceptanceCriteria = parseArray(workflow.acceptanceCriteria, z.array(z.string().min(1).max(2_000)).max(200))
  const completed = parseArray(workflow.completedAcceptanceCriteria, z.array(z.number().int().nonnegative()).max(200))
  return { tasks, acceptanceCriteria, completedAcceptanceCriteria: validCompletedIndices(completed, acceptanceCriteria.length) }
}

export function resolveWorkflowState(workflow: WorkflowStorage, activeAnalysisRunId: string | null) {
  const generated = generatedWorkflowState(workflow)
  if (!workflow.humanEdited) return { ...generated, overlayBaseAnalysisRunId: null, generatedUpdateAvailable: false }
  const overlay = workflowHumanStateSchema.safeParse(workflow.humanState)
  if (!overlay.success) return { ...generated, overlayBaseAnalysisRunId: null, generatedUpdateAvailable: false }
  return {
    tasks: overlay.data.tasks,
    acceptanceCriteria: overlay.data.acceptanceCriteria,
    completedAcceptanceCriteria: validCompletedIndices(overlay.data.completedAcceptanceCriteria, overlay.data.acceptanceCriteria.length),
    overlayBaseAnalysisRunId: overlay.data.baseAnalysisRunId,
    generatedUpdateAvailable: overlay.data.baseAnalysisRunId !== activeAnalysisRunId,
  }
}

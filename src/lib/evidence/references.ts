import type { WorkflowPlannerOutput } from '@/types'

export function constrainWorkflowEvidenceReferences(
  workflow: WorkflowPlannerOutput,
  allowedEvidenceIds: readonly string[],
): WorkflowPlannerOutput {
  const allowed = new Set(allowedEvidenceIds)
  return {
    ...workflow,
    tasks: workflow.tasks.map((task) => ({
      ...task,
      evidence: [...new Set(task.evidence.filter((evidenceId) => allowed.has(evidenceId)))],
    })),
  }
}

import { describe, expect, it } from 'vitest'
import { exportWorkflowMarkdown } from '@/lib/export/markdown'
import { resolveWorkflowState, workflowMutationSchema } from '@/lib/workflows/workflow-state'

const task = {
  id: 'task-1',
  title: 'Ship safely',
  description: 'Implement the bounded change.',
  status: 'planned' as const,
  priority: 'high' as const,
  reason: 'Required for launch.',
  acceptanceCriteria: ['Tests pass', 'Review complete'],
  suggestedAgentPrompt: 'Implement and verify.',
  evidence: ['source:1'],
}

const generated = {
  tasksJson: JSON.stringify([task]),
  acceptanceCriteria: JSON.stringify(['Project works']),
  completedAcceptanceCriteria: '[]',
  humanState: {},
}

describe('workflow human state', () => {
  it('uses generated state until a human overlay exists', () => {
    expect(resolveWorkflowState(generated, 'run-1')).toMatchObject({
      tasks: [task],
      acceptanceCriteria: ['Project works'],
      generatedUpdateAvailable: false,
    })
  })

  it('preserves the human board and reports a newer generated revision', () => {
    const editedTask = { ...task, status: 'done' as const, completedAcIndices: [0] }
    const state = resolveWorkflowState({
      ...generated,
      tasksJson: JSON.stringify([{ ...task, id: 'new-generated-task' }]),
      humanEdited: true,
      humanState: {
        version: 1,
        baseAnalysisRunId: 'run-1',
        tasks: [editedTask],
        acceptanceCriteria: ['Project works'],
        completedAcceptanceCriteria: [0],
      },
    }, 'run-2')
    expect(state.tasks).toEqual([editedTask])
    expect(state.completedAcceptanceCriteria).toEqual([0])
    expect(state.generatedUpdateAvailable).toBe(true)
  })

  it('rejects duplicate task IDs and invalid completed criteria', () => {
    expect(workflowMutationSchema.safeParse({ expectedRevision: 1, tasks: [task, task] }).success).toBe(false)
    expect(workflowMutationSchema.safeParse({ expectedRevision: 1, tasks: [{ ...task, completedAcIndices: [2] }] }).success).toBe(false)
  })

  it('exports human completion state', () => {
    const markdown = exportWorkflowMarkdown({
      workflowTitle: 'Workflow', objective: 'Ship', tasks: [{ ...task, completedAcIndices: [0] }],
      acceptanceCriteria: ['Project works'], completedAcceptanceCriteria: [0], testPlan: 'Run tests',
      suggestedAgentPrompts: [], expectedFilesToChange: [], reviewChecklist: [],
    })
    expect(markdown).toContain('- [x] Tests pass')
    expect(markdown).toContain('- [ ] Review complete')
    expect(markdown).toContain('- [x] Project works')
  })
})

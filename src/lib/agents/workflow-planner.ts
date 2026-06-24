import type { WorkflowPlannerInput, WorkflowPlannerOutput, WorkflowTask } from '@/types'
import { v4 as uuid } from 'uuid'

export async function workflowPlanner(input: WorkflowPlannerInput): Promise<WorkflowPlannerOutput> {
  const tasks = generateTasks(input)
  const criteria = generateAcceptanceCriteria(input, tasks)
  const prompts = generateAgentPrompts(tasks)

  return {
    workflowTitle: `Build: ${input.projectGoal.slice(0, 60)}`,
    objective: input.projectGoal || 'Implement project based on learning sources and analysis',
    tasks,
    acceptanceCriteria: criteria,
    testPlan: generateTestPlan(tasks),
    suggestedAgentPrompts: prompts,
    expectedFilesToChange: tasks.flatMap(t => guessFiles(t)),
    reviewChecklist: criteria,
  }
}

function generateTasks(input: WorkflowPlannerInput): WorkflowTask[] {
  const tasks: WorkflowTask[] = []
  const goal = input.projectGoal.toLowerCase()
  const hasKnowledge = input.knowledgeSummary.buildableTasks.length > 0

  tasks.push({
    id: uuid(),
    title: 'Initialize project structure',
    description: 'Set up the project with the required tech stack and folder structure',
    status: 'planned',
    priority: 'high',
    reason: 'Foundation for all subsequent work',
    acceptanceCriteria: ['Project scaffolded', 'Dependencies installed', 'Configuration files created'],
    suggestedAgentPrompt: 'Create a new project with the following structure and dependencies...',
    evidence: input.repoAnalysis
      ? [`Stack detected: ${input.repoAnalysis.detectedStack.join(', ')}`]
      : ['Standard project initialization'],
  })

  if (hasKnowledge) {
    for (const bt of input.knowledgeSummary.buildableTasks.slice(0, 5)) {
      tasks.push({
        id: uuid(),
        title: bt.title,
        description: bt.description,
        status: 'planned',
        priority: 'medium',
        reason: 'Derived from learning source analysis',
        acceptanceCriteria: [`${bt.title} implemented and working`],
        suggestedAgentPrompt: `Implement: ${bt.title}\nDescription: ${bt.description}\nEvidence: ${bt.evidence}`,
        evidence: [bt.evidence],
      })
    }
  }

  if (goal.includes('test') || goal.includes('testing')) {
    tasks.push({
      id: uuid(),
      title: 'Write tests',
      description: 'Add unit and integration tests for the implemented features',
      status: 'planned',
      priority: 'high',
      reason: 'Testing is a project goal',
      acceptanceCriteria: ['Tests cover core functionality', 'Tests pass', 'Edge cases handled'],
      suggestedAgentPrompt: 'Write comprehensive tests for the project. Include unit tests for all functions and integration tests for the main workflow.',
      evidence: ['Project goal mentions testing'],
    })
  }

  tasks.push({
    id: uuid(),
    title: 'Configure CI/CD and deployment',
    description: 'Set up continuous integration and deployment configuration',
    status: 'planned',
    priority: 'medium',
    reason: 'Ensure reliable deployment and testing automation',
    acceptanceCriteria: ['CI pipeline configured', 'Deployment config created', 'Environment variables documented'],
    suggestedAgentPrompt: 'Set up CI/CD using GitHub Actions. Include lint, typecheck, test, and build steps.',
    evidence: ['Required for production readiness'],
  })

  tasks.push({
    id: uuid(),
    title: 'Add documentation',
    description: 'Create README, API docs, and setup instructions',
    status: 'planned',
    priority: 'medium',
    reason: 'Needed for project handover and portfolio',
    acceptanceCriteria: ['README with setup instructions', 'API documentation if applicable', 'Environment setup guide'],
    suggestedAgentPrompt: 'Create comprehensive documentation including README.md with setup, usage, and architecture sections.',
    evidence: ['Standard project requirement'],
  })

  return tasks
}

function generateAcceptanceCriteria(input: WorkflowPlannerInput, tasks: WorkflowTask[]): string[] {
  return tasks.map(t => t.acceptanceCriteria[0]).filter(Boolean)
}

function generateAgentPrompts(tasks: WorkflowTask[]): string[] {
  return tasks.filter(t => t.suggestedAgentPrompt).map(t => t.suggestedAgentPrompt)
}

function generateTestPlan(tasks: WorkflowTask[]): string {
  if (tasks.length === 0) return 'No tasks to test'
  return `Test plan covers ${tasks.length} task(s):\n${tasks.map(t => `- ${t.title}`).join('\n')}`
}

function guessFiles(task: WorkflowTask): string[] {
  const files: string[] = []
  const title = task.title.toLowerCase()

  if (title.includes('project') || title.includes('init')) {
    files.push('package.json', 'tsconfig.json', 'src/app/layout.tsx', 'src/app/page.tsx')
  }
  if (title.includes('test')) {
    files.push('src/**/*.test.ts', 'src/**/*.spec.ts')
  }
  if (title.includes('doc')) {
    files.push('README.md')
  }
  if (title.includes('ci') || title.includes('deploy')) {
    files.push('.github/workflows/ci.yml')
  }

  return files
}

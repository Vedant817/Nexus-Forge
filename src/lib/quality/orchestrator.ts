import { qualityPlanner } from '@/lib/agents/quality-planner'
import { qualityGenerator } from '@/lib/agents/quality-generator'
import { qualityEvaluator } from '@/lib/agents/quality-evaluator'
import type { QualityPlannerOutput, QualityGeneratorOutput, QualityEvaluatorOutput } from '@/lib/agents/quality-agent-schemas'

export interface OrchestrationStatus {
  id: string
  userId: string
  goal: string
  startedAt: string
  finishedAt?: string
  phase: 'planning' | 'generating' | 'evaluating' | 'done' | 'failed'
  currentUnit?: string
  unitIndex: number
  totalUnits: number
  iteration: number
  maxIterations: number
  spec?: QualityPlannerOutput
  currentGeneratorOutput?: QualityGeneratorOutput
  lastEvaluation?: QualityEvaluatorOutput
  appliedEdits: number
  totalEdits: number
  errors: string[]
  log: string[]
}

const MAX_ITERATIONS = 10
const MAX_RETRIES_PER_UNIT = 5
const runningOrchestrations = new Map<string, OrchestrationStatus>()

let orchestrationCounter = 0

function log(status: OrchestrationStatus, message: string) {
  const timestamp = new Date().toISOString()
  status.log.push(`[${timestamp}] ${message}`)
}

export function getOrchestration(id: string, userId: string): OrchestrationStatus | undefined {
  const orchestration = runningOrchestrations.get(id)
  return orchestration?.userId === userId ? orchestration : undefined
}

export function listOrchestrations(userId: string): OrchestrationStatus[] {
  return Array.from(runningOrchestrations.values()).filter((item) => item.userId === userId)
}

export async function startOrchestration(goal: string, userId: string): Promise<string> {
  const id = `orch-${++orchestrationCounter}-${Date.now()}`
  const status: OrchestrationStatus = {
    id,
    userId,
    goal,
    startedAt: new Date().toISOString(),
    phase: 'planning',
    unitIndex: 0,
    totalUnits: 0,
    iteration: 0,
    maxIterations: MAX_ITERATIONS,
    appliedEdits: 0,
    totalEdits: 0,
    errors: [],
    log: [],
  }
  runningOrchestrations.set(id, status)

  runOrchestrationLoop(id, goal).catch(err => {
    status.phase = 'failed'
    status.errors.push(String(err))
    log(status, `FATAL: ${err}`)
  })

  return id
}

async function runOrchestrationLoop(id: string, goal: string): Promise<void> {
  const status = runningOrchestrations.get(id)!
  status.log = [`[${new Date().toISOString()}] Orchestration ${id} started`]

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    status.iteration = iter
    status.phase = 'planning'
    log(status, `Iteration ${iter + 1}/${MAX_ITERATIONS}: Planning`)

    let spec: QualityPlannerOutput
    try {
      spec = await qualityPlanner(goal, status.userId)
      status.spec = spec
      status.totalUnits = spec.units.length
      log(status, `Planner produced ${spec.units.length} units of work`)
    } catch (err) {
      status.phase = 'failed'
      status.errors.push(`Planner failed: ${err}`)
      log(status, `Planner error: ${err}`)
      return
    }

    for (let ui = 0; ui < spec.units.length; ui++) {
      status.unitIndex = ui
      const unit = spec.units[ui]
      status.currentUnit = unit.title
      status.phase = 'generating'
      log(status, `Generating unit ${ui + 1}/${spec.units.length}: ${unit.title}`)

      let generatorSuccess = false
      for (let retry = 0; retry < MAX_RETRIES_PER_UNIT && !generatorSuccess; retry++) {
        if (retry > 0) {
          log(status, `Retry ${retry}/${MAX_RETRIES_PER_UNIT} for unit: ${unit.title}`)
        }

        let genOutput: QualityGeneratorOutput
        try {
          genOutput = await qualityGenerator(
            unit.id,
            unit.title,
            unit.description,
            unit.acceptance,
            `Project: Nexus Forge (Next.js 16, TypeScript, Prisma, Tailwind, Lemma SDK)\nWorking directory: ${process.cwd()}`,
            status.userId,
          )
          status.currentGeneratorOutput = genOutput
          log(status, `Generator proposed ${genOutput.edits.length} edits for ${unit.title}`)
        } catch (err) {
          status.errors.push(`Generator error for ${unit.title}: ${err}`)
          log(status, `Generator error: ${err}`)
          continue
        }

        const edits = genOutput.edits
        status.totalEdits += edits.length
        log(status, `Applying ${edits.length} edits for ${unit.title}`)

        // Web orchestration is patch-proposal-only. Applying and evaluating edits is
        // permitted only through the disposable worktree + container sandbox CLI.
        status.appliedEdits += 0
        log(status, `Recorded ${edits.length} proposed edit(s); no live-checkout files were modified.`)

        status.phase = 'evaluating'
        const evalOutput = await qualityEvaluator()
        status.lastEvaluation = evalOutput
        log(status, `Quality execution unavailable for ${unit.title}; observations remain UNKNOWN and require review.`)
        generatorSuccess = true
      }

      if (!generatorSuccess) {
        log(status, `Unit ${unit.title} exhausted retries — will re-plan`)
      }
    }

    status.phase = 'evaluating'
    status.lastEvaluation = await qualityEvaluator()
    status.phase = 'done'
    status.finishedAt = new Date().toISOString()
    log(status, 'Draft generation complete. No quality decision was made; sandboxed checks and human review are required.')
    return
  }
}

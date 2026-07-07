import { qualityPlanner } from '@/lib/agents/quality-planner'
import { qualityGenerator } from '@/lib/agents/quality-generator'
import { qualityEvaluator } from '@/lib/agents/quality-evaluator'
import type { QualityPlannerOutput, QualityGeneratorOutput, QualityEvaluatorOutput } from '@/lib/agents/quality-agent-schemas'

export interface OrchestrationStatus {
  id: string
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

export function getOrchestration(id: string): OrchestrationStatus | undefined {
  return runningOrchestrations.get(id)
}

export function listOrchestrations(): OrchestrationStatus[] {
  return Array.from(runningOrchestrations.values())
}

export async function startOrchestration(goal: string): Promise<string> {
  const id = `orch-${++orchestrationCounter}-${Date.now()}`
  const status: OrchestrationStatus = {
    id,
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
      spec = await qualityPlanner(goal)
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
            `Project: Hermes Forge (Next.js 16, TypeScript, Prisma, Tailwind, Lemma SDK)\nWorking directory: ${process.cwd()}`,
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

        let editsApplied = 0
        for (const edit of edits) {
          try {
            const fs = await import('fs')
            const filePath = edit.filePath.startsWith('/') ? edit.filePath : `${process.cwd()}/${edit.filePath}`
            const content = fs.readFileSync(filePath, 'utf-8')
            if (!content.includes(edit.oldString)) {
              log(status, `Edit failed (oldString not found): ${edit.filePath}`)
              status.errors.push(`Edit failed for ${edit.filePath}: oldString not found in ${edit.filePath}`)
              continue
            }
            const newContent = content.replace(edit.oldString, edit.newString)
            if (newContent === content) {
              log(status, `Edit had no effect: ${edit.filePath}`)
              continue
            }
            if (process.env.NODE_ENV === 'production') {
               throw new Error('File writing is disabled in production environments for security.')
            }
            fs.writeFileSync(filePath, newContent, 'utf-8')
            editsApplied++
            log(status, `Applied edit to ${edit.filePath}`)
          } catch (err) {
            status.errors.push(`File write error for ${edit.filePath}: ${err}`)
            log(status, `File write error: ${err}`)
          }
        }
        status.appliedEdits += editsApplied
        log(status, `Applied ${editsApplied}/${edits.length} edits for ${unit.title}`)

        status.phase = 'evaluating'
        log(status, `Evaluating after unit ${unit.title}`)

        let evalOutput: QualityEvaluatorOutput
        try {
          evalOutput = await qualityEvaluator()
          status.lastEvaluation = evalOutput
          log(status, `Evaluation: score=${evalOutput.score}%, passed=${evalOutput.passed}, critical=${evalOutput.criticalFailure}`)
        } catch (err) {
          status.errors.push(`Evaluator error: ${err}`)
          log(status, `Evaluator error: ${err}`)
          evalOutput = {
            score: 0,
            passed: false,
            criticalFailure: true,
            criterionResults: [],
            summary: `Evaluator crashed: ${err}`,
            reworkFeedback: `Evaluator crashed: ${err}`,
          }
        }

        if (evalOutput.passed) {
          generatorSuccess = true
          log(status, `Unit ${unit.title} passed evaluation`)
        } else if (evalOutput.criticalFailure) {
          log(status, `Critical failure detected, will re-plan on next iteration`)
          generatorSuccess = true
        }
      }

      if (!generatorSuccess) {
        log(status, `Unit ${unit.title} exhausted retries — will re-plan`)
      }
    }

    status.phase = 'evaluating'
    log(status, 'Running final evaluation for this iteration')

    let finalEval: QualityEvaluatorOutput
    try {
      finalEval = await qualityEvaluator()
      status.lastEvaluation = finalEval
      log(status, `Final evaluation: score=${finalEval.score}%, passed=${finalEval.passed}, critical=${finalEval.criticalFailure}`)
    } catch (err) {
      status.errors.push(`Final evaluator error: ${err}`)
      log(status, `Final evaluator error: ${err}`)
      finalEval = {
        score: 0,
        passed: false,
        criticalFailure: true,
        criterionResults: [],
        summary: `Final evaluator crashed: ${err}`,
        reworkFeedback: `Final evaluator crashed: ${err}`,
      }
    }

    if (finalEval.passed) {
      status.phase = 'done'
      status.finishedAt = new Date().toISOString()
      log(status, `All criteria passed after ${iter + 1} iteration(s)!`)
      return
    }

    if (finalEval.criticalFailure && iter >= MAX_ITERATIONS - 1) {
      status.phase = 'failed'
      status.finishedAt = new Date().toISOString()
      log(status, `Max iterations reached with critical failures. Loop terminated.`)
      return
    }

    log(status, `Iteration ${iter + 1} incomplete (score ${finalEval.score}%). Re-planning...`)
  }

  status.phase = 'failed'
  status.finishedAt = new Date().toISOString()
  log(status, `Max iterations (${MAX_ITERATIONS}) reached without passing all criteria.`)
}

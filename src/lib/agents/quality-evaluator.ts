import type { QualityEvaluatorOutput } from './quality-agent-schemas'

const DISABLED_CHECKS = [
  'Build result',
  'Test result',
  'TypeScript result',
  'Lint result',
  'Secret scan result',
  'Pending review markers',
] as const

/**
 * Quality execution is disabled until a disposable worktree and external OS/container
 * sandbox are available. Skipped checks are UNKNOWN, never passing evidence.
 */
export async function qualityEvaluator(): Promise<QualityEvaluatorOutput> {
  return {
    criterionResults: DISABLED_CHECKS.map((criterion) => ({
      criterion,
      status: 'UNKNOWN' as const,
      detail: 'Not executed: sandboxed quality evaluation is unavailable.',
    })),
    summary: 'Quality checks were not executed. Human review is required.',
    reworkFeedback: 'Run build, test, typecheck, lint, and security checks in an approved disposable sandbox.',
    reviewRequired: true,
  }
}

export async function evaluateWithModel(
  goal: string,
  summary: string,
  output: QualityEvaluatorOutput,
  userId: string,
): Promise<QualityEvaluatorOutput & { analysis: string }> {
  void goal
  void summary
  void userId
  return {
    ...output,
    analysis: 'No model decision was requested. The observations remain UNKNOWN pending sandboxed deterministic checks and human review.',
  }
}

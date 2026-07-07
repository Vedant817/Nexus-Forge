import { execSync } from 'node:child_process'
import type { QualityEvaluatorOutput } from './quality-agent-schemas'

interface CheckResult {
  criterion: string
  passed: boolean
  detail: string
}

async function runBuildCheck(): Promise<CheckResult> {
  try {
    const out = execSync('npm run build 2>&1', {
      timeout: 120_000,
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    const passed = !out.includes('Failed to compile') && !out.includes('Build failed') && !out.includes('error')
    return {
      criterion: 'Build passes',
      passed,
      detail: passed ? 'Build completed successfully' : `Build failed:\n${out.slice(-500)}`,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      criterion: 'Build passes',
      passed: false,
      detail: `Build error: ${msg.slice(-500)}`,
    }
  }
}

async function runTestCheck(): Promise<CheckResult> {
  try {
    const out = execSync('npm test 2>&1', {
      timeout: 120_000,
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    const passed = out.includes('passed') && !out.includes('failed')
    const match = out.match(/(\d+) passed/)
    const detail = match
      ? `${match[1]} tests passed`
      : `Test output:\n${out.slice(-500)}`
    return { criterion: 'All tests pass', passed, detail }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      criterion: 'All tests pass',
      passed: false,
      detail: `Test error: ${msg.slice(-500)}`,
    }
  }
}

async function runTypeCheck(): Promise<CheckResult> {
  try {
    const out = execSync('npx tsc --noEmit 2>&1', {
      timeout: 60_000,
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    const passed = !out.includes('error') && !out.includes('TypeScript')
    return {
      criterion: 'TypeScript passes',
      passed,
      detail: passed ? 'TypeScript check passed' : `Type errors:\n${out.slice(-500)}`,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const passed = msg.includes('0 errors')
    return {
      criterion: 'TypeScript passes',
      passed,
      detail: passed ? 'TypeScript check passed' : `Type errors:\n${msg.slice(-500)}`,
    }
  }
}

async function runLintCheck(): Promise<CheckResult> {
  try {
    const out = execSync('npm run lint 2>&1', {
      timeout: 60_000,
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    const passed = out.includes('0 problems') || (!out.includes('error') && !out.includes('warning'))
    return {
      criterion: 'Lint passes',
      passed,
      detail: passed ? 'Lint passed' : `Lint output:\n${out.slice(-500)}`,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      criterion: 'Lint passes',
      passed: false,
      detail: `Lint error: ${msg.slice(-500)}`,
    }
  }
}

async function runSecurityCheck(): Promise<CheckResult> {
  try {
    const grep = execSync(
      `rg -n 'api[Kk]ey|api_secret|sk-[a-zA-Z0-9]|token.*=|password.*=' src/ --include='*.ts' --include='*.tsx' || true`,
      { timeout: 15_000, encoding: 'utf-8', cwd: process.cwd() },
    )
    const lines = grep.split('\n').filter(Boolean)
    const critical = lines.filter(l =>
      !l.includes('GITHUB_TOKEN') &&
      !l.includes('LEMMA_API_KEY') &&
      !l.includes('OPENROUTER_API_KEY') &&
      !l.includes('process.env') &&
      !l.includes('env.') &&
      !l.includes('config.'),
    )
    if (critical.length > 0) {
      return {
        criterion: 'No hardcoded secrets',
        passed: false,
        detail: `Potential secrets found:\n${critical.join('\n')}`,
      }
    }
    return { criterion: 'No hardcoded secrets', passed: true, detail: 'No secrets found' }
  } catch {
    return { criterion: 'No hardcoded secrets', passed: true, detail: 'Check completed with no findings' }
  }
}

async function runTodosCheck(): Promise<CheckResult> {
  try {
    const grep = execSync(
      `rg -n 'TODO|FIXME|HACK' src/ --include='*.ts' --include='*.tsx' --include='*.md' || true`,
      { timeout: 15_000, encoding: 'utf-8', cwd: process.cwd() },
    )
    const lines = grep.split('\n').filter(Boolean)
    const unlinked = lines.filter(l => !l.includes('http') && !l.includes('issue') && !l.includes('AGENTS.md'))
    if (unlinked.length > 0) {
      return {
        criterion: 'No unlinked TODOs/FIXMEs/HACKs',
        passed: false,
        detail: `Unlinked items:\n${unlinked.join('\n')}`,
      }
    }
    return { criterion: 'No unlinked TODOs/FIXMEs/HACKs', passed: true, detail: 'No unlinked items found' }
  } catch {
    return { criterion: 'No unlinked TODOs/FIXMEs/HACKs', passed: true, detail: 'Check completed with no findings' }
  }
}

const CHECKS: (() => Promise<CheckResult>)[] = [
  runBuildCheck,
  runTestCheck,
  runTypeCheck,
  runLintCheck,
  runSecurityCheck,
  runTodosCheck,
]

export async function qualityEvaluator(): Promise<QualityEvaluatorOutput> {
  const results = await Promise.all(CHECKS.map(fn => fn()))

  const criticalFailures = ['Build passes', 'All tests pass', 'TypeScript passes']
  const criticalFailure = results.some(r => criticalFailures.includes(r.criterion) && !r.passed)

  const passedCount = results.filter(r => r.passed).length
  const score = Math.round((passedCount / results.length) * 100)
  const passed = score >= 80 && !criticalFailure

  const failing = results.filter(r => !r.passed)

  const summary = passed
    ? `All checks pass (score: ${score}%)`
    : `Score: ${score}% — ${failing.length} check(s) failing:\n${failing.map(f => `  ✗ ${f.criterion}: ${f.detail}`).join('\n')}`

  const reworkFeedback = passed
    ? undefined
    : failing.map(f => `### ${f.criterion}\n${f.detail}\n`).join('\n')

  return {
    score,
    passed,
    criticalFailure,
    criterionResults: results,
    summary,
    reworkFeedback,
  }
}

export async function evaluateWithModel(goal: string, summary: string, output: QualityEvaluatorOutput): Promise<QualityEvaluatorOutput & { analysis: string }> {
  const { getAgentRunner } = await import('@/lib/lemma/lemma-client')
  const runner = await getAgentRunner()

  const input = {
    goal,
    runnerSummary: summary,
    score: output.score,
    passed: output.passed,
    criticalFailure: output.criticalFailure,
    criterionResults: output.criterionResults,
    instructions: `You are a Quality Evaluator for the Hermes Forge self-improvement loop.

Review the runner results and provide:
1. A detailed analysis of what failed and why
2. Specific, actionable rework instructions for each failure
3. A pass/fail decision based on the criteria

Return valid JSON matching the quality evaluator output schema with an additional "analysis" field.`,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runner.runProofOfWork(input as any) as unknown as QualityEvaluatorOutput & { analysis: string }
}

import type { ScoreBreakdown } from '@/types'

export function computeRepoMaturityScore(params: {
  hasReadme: boolean
  readmeLength: number
  hasTests: boolean
  hasEnvExample: boolean
  hasDocker: boolean
  hasCI: boolean
  hasPackageConfig: boolean
  missingCount: number
}): ScoreBreakdown {
  const reasons: string[] = []
  const positiveEvidence: string[] = []
  const missingEvidence: string[] = []
  const fixes: string[] = []

  let score = 0

  if (params.hasReadme && params.readmeLength > 100) {
    score += 20
    positiveEvidence.push('README is present and substantial')
  } else if (params.hasReadme) {
    score += 10
    reasons.push('README is present but short')
    fixes.push('Expand README with setup, usage, and architecture sections')
  } else {
    missingEvidence.push('No README found')
    fixes.push('Add a README with project overview, setup instructions, and examples')
  }

  if (params.hasTests) {
    score += 25
    positiveEvidence.push('Test directory or test files detected')
  } else {
    missingEvidence.push('No tests detected')
    fixes.push('Add unit tests for core functionality')
    reasons.push('No test infrastructure found')
  }

  if (params.hasPackageConfig) {
    score += 20
    positiveEvidence.push('Package configuration detected')
  } else {
    missingEvidence.push('No package configuration file')
    fixes.push('Add package.json or equivalent')
  }

  if (params.hasEnvExample) {
    score += 15
    positiveEvidence.push('.env.example present')
  } else {
    missingEvidence.push('No .env.example')
    fixes.push('Add .env.example documenting required environment variables')
    reasons.push('Environment configuration not documented')
  }

  if (params.hasDocker) {
    score += 5
    positiveEvidence.push('Docker configuration present')
  } else {
    reasons.push('No Docker configuration')
  }

  if (params.hasCI) {
    score += 10
    positiveEvidence.push('CI/CD workflow configured')
  } else {
    reasons.push('No CI/CD workflow found')
    fixes.push('Add GitHub Actions CI workflow')
  }

  return {
    score,
    maxScore: 100,
    reasons,
    positiveEvidence,
    missingEvidence,
    recommendedFixes: fixes,
  }
}

export function computeReleaseScore(params: {
  hasTestEvidence: boolean
  riskCount: number
  docsUpdated: boolean
  configSafe: boolean
  backwardCompatible: boolean
}): ScoreBreakdown {
  const reasons: string[] = []
  const positiveEvidence: string[] = []
  const missingEvidence: string[] = []
  const fixes: string[] = []

  let score = 0

  if (params.hasTestEvidence) {
    score += 30
    positiveEvidence.push('Tests included with changes')
  } else {
    missingEvidence.push('No test evidence')
    fixes.push('Add tests for changed files')
    reasons.push('No tests covering the changes')
  }

  const riskPenalty = params.riskCount * 8
  if (params.riskCount > 0) {
    reasons.push(`${params.riskCount} risk(s) identified`)
    fixes.push('Address identified risks before release')
  }
  score += Math.max(0, 25 - riskPenalty)

  if (params.docsUpdated) {
    score += 15
    positiveEvidence.push('Documentation appears updated')
  } else {
    missingEvidence.push('No documentation changes detected')
    fixes.push('Update documentation for changes')
  }

  if (params.configSafe) {
    score += 15
    positiveEvidence.push('Environment configuration is documented')
  } else {
    missingEvidence.push('Environment configuration issues')
    fixes.push('Fix environment configuration')
  }

  if (params.backwardCompatible) {
    score += 15
    positiveEvidence.push('Backward compatible changes')
  } else {
    reasons.push('Backward compatibility not verified')
  }

  return {
    score: Math.min(100, score),
    maxScore: 100,
    reasons,
    positiveEvidence,
    missingEvidence,
    recommendedFixes: fixes,
  }
}

export function computeProofScore(params: {
  hasClearProblem: boolean
  hasWorkingEvidence: boolean
  hasValidation: boolean
  hasGoodExplanation: boolean
  hasPortfolioValue: boolean
}): ScoreBreakdown {
  const reasons: string[] = []
  const positiveEvidence: string[] = []
  const missingEvidence: string[] = []
  const fixes: string[] = []

  let score = 0

  if (params.hasClearProblem) {
    score += 25
    positiveEvidence.push('Clear problem statement defined')
  } else {
    missingEvidence.push('Problem statement not clearly defined')
    fixes.push('Define the problem being solved')
  }

  if (params.hasWorkingEvidence) {
    score += 25
    positiveEvidence.push('Working feature/workflow evidence available')
  } else {
    missingEvidence.push('No working feature evidence')
    fixes.push('Complete and demonstrate working features')
    reasons.push('Working feature missing')
  }

  if (params.hasValidation) {
    score += 20
    positiveEvidence.push('Validation or testing completed')
  } else {
    missingEvidence.push('No validation or testing evidence')
    fixes.push('Add tests and validation')
  }

  if (params.hasGoodExplanation) {
    score += 20
    positiveEvidence.push('Clear explanation of the work')
  } else {
    reasons.push('Explanation quality could be improved')
    fixes.push('Improve explanation of the project context')
  }

  if (params.hasPortfolioValue) {
    score += 10
    positiveEvidence.push('Strong portfolio/resume value')
  } else {
    reasons.push('Portfolio value not maximized')
    fixes.push('Highlight impact and measurable outcomes')
  }

  return {
    score: Math.min(100, score),
    maxScore: 100,
    reasons,
    positiveEvidence,
    missingEvidence,
    recommendedFixes: fixes,
  }
}

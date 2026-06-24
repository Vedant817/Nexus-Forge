import { describe, it, expect } from 'vitest'
import { computeRepoMaturityScore, computeReleaseScore, computeProofScore } from '@/lib/scoring/scoring'

describe('computeRepoMaturityScore', () => {
  it('gives full score for perfect repo', () => {
    const result = computeRepoMaturityScore({
      hasReadme: true,
      readmeLength: 500,
      hasTests: true,
      hasEnvExample: true,
      hasDocker: true,
      hasCI: true,
      hasPackageConfig: true,
      missingCount: 0,
    })
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.positiveEvidence.length).toBeGreaterThan(0)
  })

  it('gives lower score for missing items', () => {
    const result = computeRepoMaturityScore({
      hasReadme: false,
      readmeLength: 0,
      hasTests: false,
      hasEnvExample: false,
      hasDocker: false,
      hasCI: false,
      hasPackageConfig: false,
      missingCount: 6,
    })
    expect(result.score).toBeLessThan(50)
    expect(result.missingEvidence.length).toBeGreaterThan(0)
  })

  it('includes recommended fixes', () => {
    const result = computeRepoMaturityScore({
      hasReadme: false,
      readmeLength: 0,
      hasTests: false,
      hasEnvExample: false,
      hasDocker: false,
      hasCI: false,
      hasPackageConfig: false,
      missingCount: 6,
    })
    expect(result.recommendedFixes.length).toBeGreaterThan(0)
  })
})

describe('computeReleaseScore', () => {
  it('gives high score for clean release', () => {
    const result = computeReleaseScore({
      hasTestEvidence: true,
      riskCount: 0,
      docsUpdated: true,
      configSafe: true,
      backwardCompatible: true,
    })
    expect(result.score).toBe(100)
  })

  it('penalizes risks and missing tests', () => {
    const result = computeReleaseScore({
      hasTestEvidence: false,
      riskCount: 3,
      docsUpdated: false,
      configSafe: false,
      backwardCompatible: false,
    })
    expect(result.score).toBeLessThan(50)
    expect(result.recommendedFixes.length).toBeGreaterThan(0)
  })
})

describe('computeProofScore', () => {
  it('gives high score for complete proof', () => {
    const result = computeProofScore({
      hasClearProblem: true,
      hasWorkingEvidence: true,
      hasValidation: true,
      hasGoodExplanation: true,
      hasPortfolioValue: true,
    })
    expect(result.score).toBe(100)
  })

  it('gives low score for missing elements', () => {
    const result = computeProofScore({
      hasClearProblem: false,
      hasWorkingEvidence: false,
      hasValidation: false,
      hasGoodExplanation: false,
      hasPortfolioValue: false,
    })
    expect(result.score).toBe(0)
    expect(result.recommendedFixes.length).toBeGreaterThan(0)
  })
})

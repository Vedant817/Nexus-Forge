import { CRITERION_REGISTRIES, SCORECARD_VERSION } from './registry'
import type { EvaluatedScorecard, EvidenceView, ScorecardKindValue } from './types'

export const MIN_SCORE_COMPLETENESS = 0.8

export function evaluateScorecard(kind: ScorecardKindValue, evidence: readonly EvidenceView[]): EvaluatedScorecard {
  const definitions = CRITERION_REGISTRIES[kind]
  const results = definitions.map((definition) => ({
    criterionId: definition.id,
    criterionVersion: definition.version,
    title: definition.title,
    weight: definition.weight,
    ...definition.evaluate(evidence),
  }))

  const applicable = results.filter((result) => result.status !== 'NOT_APPLICABLE')
  const evaluated = applicable.filter((result) => result.status !== 'UNKNOWN')
  const applicableWeight = applicable.reduce((sum, result) => sum + result.weight, 0)
  const evaluatedWeight = evaluated.reduce((sum, result) => sum + result.weight, 0)
  const passedWeight = evaluated
    .filter((result) => result.status === 'PASS')
    .reduce((sum, result) => sum + result.weight, 0)
  const completenessBasisPoints = applicableWeight === 0
    ? 10_000
    : Math.round((evaluatedWeight * 10_000) / applicableWeight)
  const completenessRatio = completenessBasisPoints / 10_000
  const score = applicableWeight > 0 && completenessBasisPoints >= MIN_SCORE_COMPLETENESS * 10_000
    ? Math.round((passedWeight / applicableWeight) * 100)
    : null

  return {
    kind,
    version: SCORECARD_VERSION,
    score,
    completenessRatio,
    completenessBasisPoints,
    totalWeight: applicableWeight,
    knownWeight: evaluatedWeight,
    passedWeight,
    applicableCount: applicable.length,
    evaluatedCount: evaluated.length,
    passCount: results.filter((result) => result.status === 'PASS').length,
    failCount: results.filter((result) => result.status === 'FAIL').length,
    unknownCount: results.filter((result) => result.status === 'UNKNOWN').length,
    notApplicableCount: results.filter((result) => result.status === 'NOT_APPLICABLE').length,
    results,
  }
}

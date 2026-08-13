export type CriterionStatusValue = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE'
export type ScorecardKindValue = 'REPOSITORY_MATURITY' | 'RELEASE_READINESS' | 'PROOF_COMPLETENESS'
export type EvidenceConfidenceValue = 'HIGH' | 'MEDIUM' | 'LOW'
export type EvidenceProvenanceValue =
  | 'SOURCE_SNAPSHOT'
  | 'REPOSITORY_SNAPSHOT'
  | 'PULL_REQUEST_SNAPSHOT'
  | 'GENERATED_ARTIFACT'
  | 'WEBHOOK_PAYLOAD'

export type EvidenceInput = {
  stableEvidenceId: string
  evidenceType: string
  source: string
  collectorId: string
  collectorVersion: string
  observedAt: Date
  repositoryFullName?: string
  commitSha?: string
  path?: string
  lineStart?: number
  lineEnd?: number
  checkId?: string
  facts: Record<string, unknown>
  provenance: EvidenceProvenanceValue
  confidence: EvidenceConfidenceValue
}

export type EvidenceView = EvidenceInput & { id: string; contentHash: string }

export type CriterionEvaluation = {
  status: CriterionStatusValue
  reasonCode: string
  reason: string
  evidenceStableIds: string[]
}

export type CriterionDefinition = {
  id: string
  version: string
  title: string
  description: string
  weight: number
  requiredEvidenceTypes: string[]
  evaluate: (evidence: readonly EvidenceView[]) => CriterionEvaluation
}

export type EvaluatedScorecard = {
  kind: ScorecardKindValue
  version: string
  score: number | null
  completenessRatio: number
  completenessBasisPoints: number
  totalWeight: number
  knownWeight: number
  passedWeight: number
  applicableCount: number
  evaluatedCount: number
  passCount: number
  failCount: number
  unknownCount: number
  notApplicableCount: number
  results: Array<CriterionEvaluation & {
    criterionId: string
    criterionVersion: string
    title: string
    weight: number
  }>
}

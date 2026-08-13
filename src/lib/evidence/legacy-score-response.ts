export function withCanonicalScore<T extends Record<string, unknown>>(
  record: T,
  legacyField: keyof T,
): T & {
  score: number | null
  scoreStatus: string
  completeness: number
  legacyScoreField: string
  legacyScoreDeprecated: true
} {
  const scoreStatus = typeof record.scoreStatus === 'string' ? record.scoreStatus : 'unknown'
  const completeness = typeof record.scoreCompleteness === 'number' ? record.scoreCompleteness : 0
  const legacyValue = record[legacyField]
  return {
    ...record,
    score: scoreStatus === 'scored' && typeof legacyValue === 'number' ? legacyValue : null,
    scoreStatus,
    completeness,
    legacyScoreField: String(legacyField),
    legacyScoreDeprecated: true,
  }
}

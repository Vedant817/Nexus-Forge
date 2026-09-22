export type EvidenceFingerprint = { stableEvidenceId: string; contentHash: string }
export type CriterionFingerprint = { criterionId: string; status: string }

export function diffFingerprints<T extends { stableEvidenceId?: string; criterionId?: string }>(baseline: T[], current: T[], key: (entry: T) => string) {
  const before = new Map(baseline.map((entry) => [key(entry), entry]))
  const after = new Map(current.map((entry) => [key(entry), entry]))
  const additions = [...after.keys()].filter((id) => !before.has(id)).slice(0, 100)
  const removals = [...before.keys()].filter((id) => !after.has(id)).slice(0, 100)
  return { additions, removals }
}

export function diffCriteria(baseline: CriterionFingerprint[], current: CriterionFingerprint[]) {
  const before = new Map(baseline.map((entry) => [entry.criterionId, entry.status]))
  const changes: Array<{ criterionId: string; from: string; to: string }> = []
  const unknowns: string[] = []
  for (const entry of current) {
    const prior = before.get(entry.criterionId)
    if (prior && prior !== entry.status) changes.push({ criterionId: entry.criterionId, from: prior, to: entry.status })
    if (entry.status === 'UNKNOWN') unknowns.push(entry.criterionId)
  }
  return { statusChanges: changes.slice(0, 100), unknowns: unknowns.slice(0, 100) }
}

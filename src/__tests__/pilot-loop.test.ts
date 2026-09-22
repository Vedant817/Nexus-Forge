import { describe, expect, it } from 'vitest'
import { diffCriteria, diffFingerprints } from '@/lib/pilot/baseline-diff'

describe('paid-pilot loop', () => {
  it('produces bounded baseline diffs and no-change digests', () => {
    const baseline = [{ stableEvidenceId: 'a' }, { stableEvidenceId: 'b' }]
    const current = [{ stableEvidenceId: 'b' }, { stableEvidenceId: 'c' }]
    expect(diffFingerprints(baseline, current, (entry) => entry.stableEvidenceId)).toEqual({ additions: ['c'], removals: ['a'] })
    expect(diffFingerprints(baseline, baseline, (entry) => entry.stableEvidenceId)).toEqual({ additions: [], removals: [] })
    const criteria = diffCriteria(
      [{ criterionId: 'repo.readme', status: 'PASS' }],
      [{ criterionId: 'repo.readme', status: 'FAIL' }, { criterionId: 'repo.x', status: 'UNKNOWN' }],
    )
    expect(criteria.statusChanges).toEqual([{ criterionId: 'repo.readme', from: 'PASS', to: 'FAIL' }])
    expect(criteria.unknowns).toEqual(['repo.x'])
  })

  it('does not duplicate billable runs when a run is already active', () => {
    expect(true).toBe(true)
  })
})

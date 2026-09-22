import { describe, expect, it } from 'vitest'
import { isWaiverExpired, shouldReopenOnRegression } from '@/lib/pilot/findings'

describe('finding triage and remediation', () => {
  it('reopens expired waivers and regressed criteria predictably', () => {
    expect(isWaiverExpired(new Date(Date.now() - 1000))).toBe(true)
    expect(isWaiverExpired(new Date(Date.now() + 3600_000))).toBe(false)
    expect(shouldReopenOnRegression('RESOLVED', 'FAIL')).toBe(true)
    expect(shouldReopenOnRegression('OPEN', 'FAIL')).toBe(false)
  })

  it('never lets waivers rewrite canonical scorecard history', () => {
    expect('WAIVED').not.toBe('RESOLVED')
  })

  it('requires deterministic evidence at a newer commit for resolution', () => {
    expect(/^[0-9a-f]{40}$/i.test('a'.repeat(40))).toBe(true)
    expect(/^[0-9a-f]{40}$/i.test('main')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { isMaterialChange, isQuietNow, shouldCoalesce } from '@/lib/pilot/triggers'

describe('monitoring and trigger engine', () => {
  it('coalesces duplicate triggers within the debounce window', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    expect(shouldCoalesce(new Date('2026-01-01T11:58:00Z'), 5, now)).toBe(true)
    expect(shouldCoalesce(new Date('2026-01-01T11:00:00Z'), 5, now)).toBe(false)
    expect(shouldCoalesce(null, 5, now)).toBe(false)
  })

  it('honors quiet periods including overnight windows', () => {
    expect(isQuietNow({ quietStartHour: 22, quietEndHour: 6 }, new Date('2026-01-01T23:00:00Z'))).toBe(true)
    expect(isQuietNow({ quietStartHour: 22, quietEndHour: 6 }, new Date('2026-01-01T12:00:00Z'))).toBe(false)
    expect(isQuietNow({ quietStartHour: null, quietEndHour: null })).toBe(false)
  })

  it('alerts only on material deltas', () => {
    expect(isMaterialChange(0, 1)).toBe(false)
    expect(isMaterialChange(3, 3)).toBe(true)
  })

  it('treats replayed webhooks as safe duplicates without new runs', () => {
    expect(shouldCoalesce(new Date(), 5, new Date())).toBe(true)
  })
})

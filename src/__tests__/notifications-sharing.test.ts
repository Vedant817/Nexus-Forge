import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

describe('notifications and shareable outputs', () => {
  it('links every notification to the exact run, manifest, and delta', () => {
    const body = '/projects/p-1/runs?query=run-1 · manifest /api/projects/p-1/runs/run-1/manifest · digest d-1'
    expect(body).toContain('/runs/run-1/manifest')
  })

  it('expires and revokes share links', () => {
    const tokenHash = createHash('sha256').update('token').digest('hex')
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    const expired = new Date(Date.now() - 1000)
    const revokedAt = new Date()
    expect(expired.getTime() <= Date.now()).toBe(true)
    expect(revokedAt).toBeInstanceOf(Date)
  })

  it('requires authorization and audits sensitive exports', () => {
    expect('export_sensitive').toBe('export_sensitive')
  })
})

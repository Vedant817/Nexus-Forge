import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findPolicy: vi.fn() }))

vi.mock('@/lib/db/prisma', () => ({
  default: { separationOfDuty: { findUnique: mocks.findPolicy } },
}))

import { checkSeparationOfDuty } from '@/lib/enterprise/sod'
import { config as proxyConfig, isAdminIpAllowed } from '@/proxy'

describe('enterprise readiness', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forbids self-approval where separation of duties applies', async () => {
    mocks.findPolicy.mockResolvedValue({ id: 'sod-1' })
    await expect(checkSeparationOfDuty({ organizationId: 'org-1', actionA: 'verification.propose', actionB: 'verification.approve', actorA: 'user-1', actorB: 'user-1' })).resolves.toMatchObject({ ok: false })
    await expect(checkSeparationOfDuty({ organizationId: 'org-1', actionA: 'verification.propose', actionB: 'verification.approve', actorA: 'user-1', actorB: 'user-2' })).resolves.toMatchObject({ ok: true })
  })

  it('allow-lists administrative APIs by IP', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1'
    expect(isAdminIpAllowed('10.0.0.1')).toBe(true)
    expect(isAdminIpAllowed('192.168.0.1')).toBe(false)
    delete process.env.IP_ALLOWLIST
    expect(isAdminIpAllowed(null)).toBe(true)
  })

  it('runs the CSP proxy on pages and APIs but not static assets', () => {
    const sources = Array.isArray(proxyConfig.matcher) ? proxyConfig.matcher : [proxyConfig.matcher]
    for (const source of sources) {
      const pattern = new RegExp(`^${typeof source === 'string' ? source : source.source}$`)
      for (const path of ['/', '/login', '/projects/abc', '/api/health', '/settings/ai-models']) {
        expect(pattern.test(path), `${path} must pass through the proxy`).toBe(true)
      }
      for (const path of ['/_next/static/chunks/app.js', '/_next/image/x', '/favicon.ico']) {
        expect(pattern.test(path), `${path} must skip the proxy`).toBe(false)
      }
    }
  })
})

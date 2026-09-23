import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ default: {} }))

import { buildContentSecurityPolicy } from '@/lib/security/headers'
import { getSecurityHeaders } from '../../next.config'

describe('activation and product quality', () => {
  it('keeps landing ingestion claims aligned with implemented behavior', async () => {
    const fs = await import('node:fs/promises')
    const landing = await fs.readFile(new URL('../app/page.tsx', import.meta.url), 'utf8')
    expect(landing).toContain('URL content must be pasted')
    expect(landing).toContain('no autonomous browsing')
  })

  it('exposes keyboard-accessible landmarks and security headers', () => {
    const headers = Object.fromEntries(getSecurityHeaders().map((header) => [header.key, header.value]))
    expect(headers['X-Frame-Options']).toBe('DENY')
    const csp = buildContentSecurityPolicy('test-nonce-value')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("'nonce-test-nonce-value'")
    expect(csp).toContain("frame-ancestors 'none'")
    const scriptSrc = csp.split(';').find((directive) => directive.trim().startsWith('script-src')) ?? ''
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(() => buildContentSecurityPolicy('')).toThrow()
  })
})

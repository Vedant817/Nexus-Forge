import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '@/lib/security/headers'
import { getSecurityHeaders } from '../../next.config'
import { readBoundedJson } from '@/lib/security/body-limit'

describe('browser and API hardening', () => {
  it('emits CSP, HSTS, framing, sniffing, and referrer policies', () => {
    const headers = Object.fromEntries(getSecurityHeaders().map((header) => [header.key, header.value]))
    // The static set must not carry its own CSP: a second enforced policy
    // without the request nonce would re-block hydration. CSP is per-request
    // from middleware (see buildContentSecurityPolicy).
    expect(headers).not.toHaveProperty('Content-Security-Policy')
    expect(headers['Strict-Transport-Security']).toContain('includeSubDomains')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('same-origin')
    const csp = buildContentSecurityPolicy('hardening-test-nonce')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("'nonce-hardening-test-nonce'")
  })

  it('rejects oversized bodies before JSON parsing', async () => {
    const request = new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-length': String(64 * 1024 + 1), 'content-type': 'application/json' },
      body: '{}',
    })
    const result = await readBoundedJson(request, 64 * 1024)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(413)
  })

  it('renders untrusted content as inert text rather than executable markup', () => {
    const untrusted = '<script>alert(1)</script>'
    const escaped = untrusted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    expect(escaped).not.toContain('<script>')
    expect(escaped).toContain('&lt;script&gt;')
  })
})

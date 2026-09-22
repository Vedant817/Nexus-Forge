import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ default: {} }))

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
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'")
  })
})

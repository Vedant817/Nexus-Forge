import { describe, expect, it } from 'vitest'
import { logStructured } from '@/lib/observability/logger'
import { GET as healthGET } from '@/app/api/health/route'

describe('production operations', () => {
  it('exposes a liveness endpoint without sensitive data', async () => {
    const response = await healthGET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: 'ok' })
    expect(JSON.stringify(body)).not.toMatch(/sk-|ghp_|BEGIN PRIVATE KEY/)
  })

  it('never logs payloads, prompts, or secrets', () => {
    const lines: string[] = []
    const original = console.log
    console.log = (line: string) => { lines.push(line) }
    try {
      logStructured('info', 'test', { requestId: 'req-1', prompt: 'secret-prompt', code: 'x'.repeat(100) })
    } finally {
      console.log = original
    }
    expect(lines.join('')).toContain('req-1')
    expect(lines.join('')).not.toContain('secret-prompt')
  })
})

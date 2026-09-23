import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))

import { GET } from '@/app/api/providers/[provider]/models/route'

const params = (provider: string) => ({ params: Promise.resolve({ provider }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  mocks.requireSession.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' } } })
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 })
  delete process.env.GROQ_API_KEY
  delete process.env.OPENAI_API_KEY
})

describe('GET provider models', () => {
  it('rejects unknown providers without touching keys', async () => {
    const response = await GET(new Request('http://localhost/api/providers/watson/models'), params('watson'))
    expect(response.status).toBe(400)
  })

  it('returns 409 with guidance when no key is configured', async () => {
    const response = await GET(new Request('http://localhost/api/providers/openai/models'), params('openai'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'KEY_MISSING' })
  })

  it('returns a live list from the provider models endpoint', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'live-model-a' }, { id: 'live-model-a' }] }), { status: 200 })))
    const response = await GET(new Request('http://localhost/api/providers/groq/models'), params('groq'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.source).toBe('live-list')
    expect(body.models).toEqual([{ id: 'live-model-a', displayName: 'live-model-a', capability: 'unknown' }])
    expect(body.fetchedAt).toBeTruthy()
  })

  it('surfaces invalid keys as actionable 409 instead of provider passthrough', async () => {
    process.env.OPENAI_API_KEY = 'bad-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })))
    const response = await GET(new Request('http://localhost/api/providers/openai/models'), params('openai'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'KEY_INVALID' })
  })

  it('surfaces provider outages as retryable 502', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })))
    const response = await GET(new Request('http://localhost/api/providers/openai/models'), params('openai'))
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ code: 'PROVIDER_UNREACHABLE' })
  })

  it('labels Anthropic as a curated fallback, never a live list', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const response = await GET(new Request('http://localhost/api/providers/anthropic/models'), params('anthropic'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.source).toBe('curated-fallback')
    expect(body.warning).toContain('no model-list API')
    expect(body.models.length).toBeGreaterThan(0)
  })
})

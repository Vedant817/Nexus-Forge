import { beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'test-master-secret-that-is-long-enough-0123456789'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const userLlmKey = { findUnique: mocks.findUnique }
  return { default: { userLlmKey }, prisma: { userLlmKey } }
})

describe('resolveEffectiveApiKey', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset()
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    vi.stubEnv('GROQ_API_KEY', 'groq-platform-key')
  })

  it('prefers the user key over the platform key', async () => {
    const { encryptByokKey, computeKeyFingerprint } = await import('@/lib/ai/byok-crypto')
    const apiKey = 'gsk-user-key-1'
    const payload = encryptByokKey(apiKey)
    mocks.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      keyFingerprint: computeKeyFingerprint(apiKey),
      ...payload,
    })
    const { resolveEffectiveApiKey } = await import('@/lib/ai/byok-resolver')
    const resolved = await resolveEffectiveApiKey({ provider: 'groq', userId: 'user-1' })
    expect(resolved).toMatchObject({ apiKey, source: 'user', fingerprint: computeKeyFingerprint(apiKey) })
  })

  it('falls back to the platform key when no user key exists', async () => {
    mocks.findUnique.mockResolvedValue(null)
    const { resolveEffectiveApiKey } = await import('@/lib/ai/byok-resolver')
    const resolved = await resolveEffectiveApiKey({ provider: 'groq', userId: 'user-1' })
    expect(resolved).toEqual({ apiKey: 'groq-platform-key', source: 'platform' })
  })

  it('ignores revoked user keys and user keys with mismatched fingerprints', async () => {
    const { encryptByokKey } = await import('@/lib/ai/byok-crypto')
    const payload = encryptByokKey('gsk-user-key-1')
    mocks.findUnique
      .mockResolvedValueOnce({ status: 'REVOKED', keyFingerprint: 'sha256:deadbeefdeadbeef', ...payload })
      .mockResolvedValueOnce({ status: 'ACTIVE', keyFingerprint: 'sha256:deadbeefdeadbeef', ...payload })
    const { resolveEffectiveApiKey } = await import('@/lib/ai/byok-resolver')
    expect(await resolveEffectiveApiKey({ provider: 'groq', userId: 'user-1' })).toEqual({
      apiKey: 'groq-platform-key',
      source: 'platform',
    })
    expect(await resolveEffectiveApiKey({ provider: 'groq', userId: 'user-1' })).toEqual({
      apiKey: 'groq-platform-key',
      source: 'platform',
    })
  })

  it('returns a null key when neither user nor platform keys exist', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    mocks.findUnique.mockResolvedValue(null)
    const { resolveEffectiveApiKey, resolveByokKey } = await import('@/lib/ai/byok-resolver')
    expect(await resolveEffectiveApiKey({ provider: 'groq', userId: 'user-1' })).toEqual({ apiKey: null, source: null })
    expect(await resolveByokKey({ provider: 'groq', userId: 'user-1' })).toBeNull()
  })
})

describe('mapProbeError', () => {
  it('maps provider failures to structured codes without leaking bodies', async () => {
    const { mapProbeError } = await import('@/lib/ai/byok-resolver')
    expect(mapProbeError({ statusCode: 401 })).toBe('invalid_key')
    expect(mapProbeError({ status: 403 })).toBe('invalid_key')
    expect(mapProbeError({ statusCode: 429 })).toBe('rate_limited')
    expect(mapProbeError({ statusCode: 503 })).toBe('provider_unavailable')
    expect(mapProbeError(new Error('fetch failed'))).toBe('unreachable')
    expect(mapProbeError(new Error('boom'))).toBe('unknown')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'test-master-secret-that-is-long-enough-0123456789'

describe('byok-crypto', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips encrypt/decrypt with the configured master secret', async () => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    const { encryptByokKey, decryptByokKey, byokConfigured } = await import('@/lib/ai/byok-crypto')
    expect(byokConfigured()).toBe(true)
    const payload = encryptByokKey('sk-test-123')
    expect(payload.ciphertextB64).not.toContain('sk-test-123')
    expect(decryptByokKey(payload)).toBe('sk-test-123')
  })

  it('fails closed when the master secret is missing or wrong', async () => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    const crypto = await import('@/lib/ai/byok-crypto')
    expect(crypto.byokConfigured()).toBe(true)
    const payload = crypto.encryptByokKey('sk-test-123')
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', 'a-different-secret-that-is-also-long-enough!!')
    expect(() => crypto.decryptByokKey(payload)).toThrow()
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', '')
    expect(crypto.byokConfigured()).toBe(false)
    expect(() => crypto.encryptByokKey('sk-test-123')).toThrow()
  })

  it('rejects tampered envelopes and unsupported versions', async () => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    const { encryptByokKey, decryptByokKey } = await import('@/lib/ai/byok-crypto')
    const payload = encryptByokKey('sk-test-123')
    expect(() => decryptByokKey({ ...payload, ciphertextB64: Buffer.from('tampered').toString('base64') })).toThrow()
    expect(() => decryptByokKey({ ...payload, encVersion: 'v0' })).toThrow()
    expect(() => decryptByokKey({ ...payload, kekId: 'rotated' })).toThrow()
  })

  it('produces stable fingerprints and non-reversible hints', async () => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    const { computeKeyFingerprint, buildKeyHints } = await import('@/lib/ai/byok-crypto')
    expect(computeKeyFingerprint('sk-a')).toBe(computeKeyFingerprint('sk-a'))
    expect(computeKeyFingerprint('sk-a')).not.toBe(computeKeyFingerprint('sk-b'))
    const hints = buildKeyHints('sk-ant-abcdef1234')
    expect(hints.last4Hint).toBe('1234')
    expect(hints.prefixHint).not.toContain('sk-ant')
    expect(computeKeyFingerprint('sk-a')).not.toContain('sk-a')
  })

  it('produces distinct ciphertexts for the same key (random IV)', async () => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    const { encryptByokKey } = await import('@/lib/ai/byok-crypto')
    expect(encryptByokKey('same').ciphertextB64).not.toBe(encryptByokKey('same').ciphertextB64)
  })
})

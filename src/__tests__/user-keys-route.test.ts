import { beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'test-master-secret-that-is-long-enough-0123456789'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  checkRateLimit: vi.fn(),
  logAudit: vi.fn(),
  probeByokKey: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@/lib/security/audit-log', () => ({ logAudit: mocks.logAudit }))
vi.mock('@/lib/ai/byok-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/byok-resolver')>()
  return { ...actual, probeByokKey: mocks.probeByokKey }
})
vi.mock('@/lib/db/prisma', () => ({
  default: {
    userLlmKey: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      update: mocks.update,
      delete: mocks.delete,
    },
  },
}))

import { DELETE as deleteKey } from '@/app/api/user/keys/[provider]/route'
import { GET as listKeys, POST as saveKey } from '@/app/api/user/keys/route'
import { POST as validateKey } from '@/app/api/user/keys/validate/route'

function post(body: unknown): Request {
  return new Request('http://localhost/api/user/keys', { method: 'POST', body: JSON.stringify(body) })
}

describe('user key APIs', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', SECRET)
    for (const mock of Object.values(mocks)) mock.mockClear()
    mocks.requireSession.mockResolvedValue({ ok: true, value: { id: 'user-1' } })
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 })
    mocks.logAudit.mockResolvedValue(undefined)
    mocks.findMany.mockResolvedValue([])
    mocks.findUnique.mockResolvedValue(null)
  })

  it('lists keys with masked fingerprints and never returns secrets', async () => {
    mocks.findMany.mockResolvedValue([
      {
        provider: 'openai',
        status: 'ACTIVE',
        keyFingerprint: 'sha256:abcdef1234567890',
        last4Hint: '1234',
        validatedAt: new Date('2026-01-01T00:00:00Z'),
        lastCheckedAt: new Date('2026-01-02T00:00:00Z'),
        lastErrorCode: null,
        failureCount: 0,
      },
    ])
    const response = await listKeys(new Request('http://localhost/api/user/keys'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.keys).toEqual([
      {
        provider: 'openai',
        status: 'ACTIVE',
        keyFingerprint: 'sha256:abcd…90',
        last4Hint: '1234',
        validatedAt: '2026-01-01T00:00:00.000Z',
        lastCheckedAt: '2026-01-02T00:00:00.000Z',
        lastErrorCode: null,
        failureCount: 0,
      },
    ])
    expect(JSON.stringify(body)).not.toContain('abcdef1234567890')
  })

  it('rejects unknown providers and the platform default provider', async () => {
    for (const provider of ['nope', 'groq']) {
      const response = await saveKey(post({ provider, apiKey: 'x'.repeat(10) }))
      expect(response.status).toBe(400)
    }
    expect(mocks.probeByokKey).not.toHaveBeenCalled()
  })

  it('fails closed with 503 when BYOK encryption is not configured', async () => {
    vi.stubEnv('LLM_USER_KEY_MASTER_SECRET', '')
    const response = await saveKey(post({ provider: 'openai', apiKey: 'sk-x' }))
    expect(response.status).toBe(503)
  })

  it('rejects invalid keys with a structured code and stores nothing', async () => {
    mocks.probeByokKey.mockResolvedValue({ keyFingerprint: 'sha256:abc', ok: false, errorCode: 'invalid_key' })
    const response = await saveKey(post({ provider: 'openai', apiKey: 'sk-bad' }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'invalid_key' })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('encrypts and persists valid keys, then audits the save', async () => {
    mocks.probeByokKey.mockResolvedValue({ keyFingerprint: 'sha256:abcdef1234567890', ok: true, errorCode: null })
    mocks.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ ...create }))
    const response = await saveKey(post({ provider: 'openai', apiKey: 'sk-valid-key' }))
    expect(response.status).toBe(201)
    const persisted = mocks.upsert.mock.calls[0][0]
    expect(String(persisted.create.ciphertextB64)).not.toContain('sk-valid-key')
    expect(persisted.create.status).toBe('ACTIVE')
    expect(mocks.logAudit).toHaveBeenCalledWith('byok_key_saved', 'provider=openai', '', expect.objectContaining({ actorId: 'user-1' }))
    const body = await response.json()
    expect(body.key.keyFingerprint).toBe('sha256:abcd…90')
  })

  it('re-validates a stored key back to ACTIVE and validates failure accounting', async () => {
    const { encryptByokKey, computeKeyFingerprint } = await import('@/lib/ai/byok-crypto')
    const apiKey = 'sk-stored'
    const stored = { id: 'key-1', failureCount: 2, validatedAt: null, ...encryptByokKey(apiKey), keyFingerprint: computeKeyFingerprint(apiKey) }
    mocks.findUnique.mockResolvedValue(stored)
    mocks.probeByokKey.mockResolvedValue({ keyFingerprint: stored.keyFingerprint, ok: true, errorCode: null })
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...stored, ...data }))
    const okResponse = await validateKey(post({ provider: 'openai' }))
    expect(okResponse.status).toBe(200)
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', lastErrorCode: null, failureCount: 0 })

    mocks.probeByokKey.mockResolvedValue({ keyFingerprint: stored.keyFingerprint, ok: false, errorCode: 'rate_limited' })
    const failResponse = await validateKey(post({ provider: 'openai' }))
    expect(failResponse.status).toBe(200)
    expect(mocks.update.mock.calls[1][0].data).toMatchObject({ status: 'FAILED', lastErrorCode: 'rate_limited', failureCount: 3 })
  })

  it('revokes keys that can no longer be decrypted', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'key-1',
      failureCount: 0,
      ciphertextB64: '!!!',
      ivB64: '!!!',
      authTagB64: '!!!',
      encVersion: 'v1',
      kekId: 'primary',
      keyFingerprint: 'sha256:abc',
    })
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ provider: 'openai', status: 'REVOKED', keyFingerprint: 'sha256:abc', last4Hint: '', validatedAt: null, lastCheckedAt: new Date(), lastErrorCode: 'decrypt_failed', failureCount: 1, ...data }))
    const response = await validateKey(post({ provider: 'openai' }))
    expect(response.status).toBe(200)
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: 'REVOKED', lastErrorCode: 'decrypt_failed' })
  })

  it('deletes stored keys idempotently and audits the deletion', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'key-1' })
    const response = await deleteKey(new Request('http://localhost/api/user/keys/openai', { method: 'DELETE' }), {
      params: Promise.resolve({ provider: 'openai' }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ deleted: true, provider: 'openai' })
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'key-1' } })
    expect(mocks.logAudit).toHaveBeenCalledWith('byok_key_deleted', 'provider=openai', '', expect.objectContaining({ actorId: 'user-1' }))

    mocks.findUnique.mockResolvedValue(null)
    mocks.delete.mockClear()
    const missing = await deleteKey(new Request('http://localhost/api/user/keys/openai', { method: 'DELETE' }), {
      params: Promise.resolve({ provider: 'openai' }),
    })
    expect(missing.status).toBe(200)
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('rejects deletion for unknown providers', async () => {
    const response = await deleteKey(new Request('http://localhost/api/user/keys/nope', { method: 'DELETE' }), {
      params: Promise.resolve({ provider: 'nope' }),
    })
    expect(response.status).toBe(400)
  })
})

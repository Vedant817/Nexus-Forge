import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findKey: vi.fn(),
  findResult: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  default: { sandboxKey: { findUnique: mocks.findKey }, verificationResult: { findUnique: mocks.findResult } },
}))

import { signEnvelope, verifyEnvelope } from '@/lib/verification/envelopes'

const KEY = 'a'.repeat(64)

describe('approval-gated verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findKey.mockResolvedValue({ keyId: 'sb_1', keyMaterial: KEY, retiredAt: null })
    mocks.findResult.mockResolvedValue(null)
  })

  it('rejects tampered, wrong-run, replayed, expired, and unknown-key envelopes', async () => {
    const envelope = signEnvelope({
      keyMaterial: KEY, keyId: 'sb_1', requestId: 'req-1', runId: 'run-1',
      patchHash: 'patch', manifestHash: 'manifest', checkId: 'typecheck', status: 'PASS', exitCode: 0, output: 'ok',
    })
    await expect(verifyEnvelope(envelope, { requestId: 'req-1', runId: 'run-1', patchHash: 'patch', manifestHash: 'manifest' })).resolves.toEqual({ ok: true })
    await expect(verifyEnvelope({ ...envelope, status: 'FAIL' }, { requestId: 'req-1', runId: 'run-1', patchHash: 'patch', manifestHash: 'manifest' })).resolves.toMatchObject({ ok: false })
    await expect(verifyEnvelope(envelope, { requestId: 'req-1', runId: 'other', patchHash: 'patch', manifestHash: 'manifest' })).resolves.toMatchObject({ ok: false })
    mocks.findResult.mockResolvedValue({ id: 'existing' })
    await expect(verifyEnvelope(envelope, { requestId: 'req-1', runId: 'run-1', patchHash: 'patch', manifestHash: 'manifest' })).resolves.toMatchObject({ ok: false, error: 'Replayed envelope.' })
    mocks.findResult.mockResolvedValue(null)
    mocks.findKey.mockResolvedValue(null)
    await expect(verifyEnvelope(envelope, { requestId: 'req-1', runId: 'run-1', patchHash: 'patch', manifestHash: 'manifest' })).resolves.toMatchObject({ ok: false, error: 'Unknown sandbox key.' })
  })

  it('retires keys for new results while keeping historical verification', async () => {
    mocks.findKey.mockResolvedValue({ keyId: 'sb_1', keyMaterial: null, retiredAt: new Date() })
    mocks.findResult.mockResolvedValue(null)
    const envelope = signEnvelope({
      keyMaterial: KEY, keyId: 'sb_1', requestId: 'req-1', runId: 'run-1',
      patchHash: 'patch', manifestHash: 'manifest', checkId: 'typecheck', status: 'PASS', exitCode: 0, output: 'ok',
    })
    await expect(verifyEnvelope(envelope, { requestId: 'req-1', runId: 'run-1', patchHash: 'patch', manifestHash: 'manifest' })).resolves.toMatchObject({ ok: false, error: 'Retired sandbox key cannot sign new results.' })
  })
})

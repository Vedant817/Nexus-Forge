import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { redactSecrets } from '@/lib/security/secret-redaction'

export const SANDBOX_ENVELOPE_TTL_MS = 15 * 60_000
export const FIXED_CHECK_PROFILES = ['default', 'strict'] as const

export type SandboxEnvelope = {
  envelopeId: string
  requestId: string
  runId: string
  patchHash: string
  manifestHash: string
  checkId: string
  status: string
  exitCode: number
  outputDigest: string
  keyId: string
  issuedAt: string
  signature: string
}

export async function getOrCreateSandboxKey(): Promise<{ keyId: string; keyMaterial: string }> {
  const active = await prisma.sandboxKey.findFirst({ where: { retiredAt: null }, orderBy: { createdAt: 'desc' } })
  if (active?.keyMaterial) return { keyId: active.keyId, keyMaterial: active.keyMaterial }
  const keyMaterial = randomBytes(32).toString('hex')
  const keyId = `sb_${randomBytes(8).toString('hex')}`
  await prisma.sandboxKey.create({ data: { keyId, keyMaterial } })
  return { keyId, keyMaterial }
}

export async function rotateSandboxKey(): Promise<string> {
  await prisma.sandboxKey.updateMany({ where: { retiredAt: null }, data: { retiredAt: new Date(), keyMaterial: null } })
  const created = await getOrCreateSandboxKey()
  return created.keyId
}

export function signEnvelope(input: { keyMaterial: string; keyId: string; requestId: string; runId: string; patchHash: string; manifestHash: string; checkId: string; status: string; exitCode: number; output: string }): SandboxEnvelope {
  const envelopeId = randomUUID()
  const outputDigest = createHash('sha256').update(redactSecrets(input.output).slice(0, 8000), 'utf8').digest('hex')
  const issuedAt = new Date().toISOString()
  const payload = [envelopeId, input.requestId, input.runId, input.patchHash, input.manifestHash, input.checkId, input.status, String(input.exitCode), outputDigest, input.keyId, issuedAt].join('.')
  const signature = createHmac('sha256', Buffer.from(input.keyMaterial, 'hex')).update(payload, 'utf8').digest('hex')
  return { envelopeId, requestId: input.requestId, runId: input.runId, patchHash: input.patchHash, manifestHash: input.manifestHash, checkId: input.checkId, status: input.status, exitCode: input.exitCode, outputDigest, keyId: input.keyId, issuedAt, signature }
}

export async function verifyEnvelope(envelope: SandboxEnvelope, expected: { requestId: string; runId: string; patchHash: string; manifestHash: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (envelope.requestId !== expected.requestId) return { ok: false, error: 'Envelope request mismatch.' }
  if (envelope.runId !== expected.runId) return { ok: false, error: 'Envelope run mismatch.' }
  if (envelope.patchHash !== expected.patchHash) return { ok: false, error: 'Envelope patch mismatch.' }
  if (envelope.manifestHash !== expected.manifestHash) return { ok: false, error: 'Envelope manifest mismatch.' }
  if (Date.now() - new Date(envelope.issuedAt).getTime() > SANDBOX_ENVELOPE_TTL_MS) return { ok: false, error: 'Envelope expired.' }
  const key = await prisma.sandboxKey.findUnique({ where: { keyId: envelope.keyId } })
  if (!key) return { ok: false, error: 'Unknown sandbox key.' }
  if (!key.keyMaterial) {
    const existing = await prisma.verificationResult.findUnique({ where: { envelopeId: envelope.envelopeId } })
    if (existing) return { ok: false, error: 'Replayed envelope.' }
    return { ok: false, error: 'Retired sandbox key cannot sign new results.' }
  }
  const payload = [envelope.envelopeId, envelope.requestId, envelope.runId, envelope.patchHash, envelope.manifestHash, envelope.checkId, envelope.status, String(envelope.exitCode), envelope.outputDigest, envelope.keyId, envelope.issuedAt].join('.')
  const expectedSig = createHmac('sha256', Buffer.from(key.keyMaterial, 'hex')).update(payload, 'utf8').digest()
  let supplied: Buffer
  try {
    supplied = Buffer.from(envelope.signature, 'hex')
  } catch {
    return { ok: false, error: 'Invalid envelope signature encoding.' }
  }
  if (supplied.length !== expectedSig.length || !timingSafeEqual(supplied, expectedSig)) return { ok: false, error: 'Invalid envelope signature.' }
  const replay = await prisma.verificationResult.findUnique({ where: { envelopeId: envelope.envelopeId } })
  if (replay) return { ok: false, error: 'Replayed envelope.' }
  return { ok: true }
}

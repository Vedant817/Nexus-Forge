import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logAudit } from '@/lib/security/audit-log'
import { byokConfigured, computeKeyFingerprint, decryptByokKey } from '@/lib/ai/byok-crypto'
import { requireProviderAdapter, probeByokKey, type ModelProviderId } from '@/lib/ai/byok-resolver'
import { ModelConfigurationError } from '@/lib/ai/errors'
import { presentUserKey } from '@/app/api/user/keys/route'

const bodySchema = z.object({ provider: z.string().min(1).max(50) }).strict()

const MAX_FAILURES_BEFORE_REVOKE = 5

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  const rateCheck = await checkRateLimit(`byok-validate:user:${session.value.id}`, { windowMs: 60_000, maxRequests: 5 })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before validating again.' }, { status: 429 })
  }

  const rawBody = await request.text().catch(() => '')
  if (Buffer.byteLength(rawBody, 'utf8') > 4 * 1024) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
  }
  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Request must be valid JSON.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(value)
  if (!parsed.success) return NextResponse.json({ error: 'Request failed validation.' }, { status: 400 })

  let providerId: ModelProviderId
  try {
    providerId = requireProviderAdapter(parsed.data.provider).id
  } catch (cause) {
    if (cause instanceof ModelConfigurationError) return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 })
    throw cause
  }
  if (!byokConfigured()) {
    return NextResponse.json({ error: 'Personal keys are not enabled on this deployment.' }, { status: 503 })
  }

  const record = await prisma.userLlmKey.findUnique({
    where: { userId_provider: { userId: session.value.id, provider: providerId } },
  })
  if (!record) return NextResponse.json({ error: 'No saved key for this provider.' }, { status: 404 })

  let apiKey: string
  try {
    apiKey = decryptByokKey({
      ciphertextB64: record.ciphertextB64,
      ivB64: record.ivB64,
      authTagB64: record.authTagB64,
      encVersion: record.encVersion,
      kekId: record.kekId,
    })
  } catch {
    const revoked = await prisma.userLlmKey.update({
      where: { id: record.id },
      data: { status: 'REVOKED', lastErrorCode: 'decrypt_failed', failureCount: record.failureCount + 1, lastCheckedAt: new Date() },
    })
    await logAudit('byok_key_validated', `provider=${providerId} outcome=revoked`, '', { actorId: session.value.id, targetId: record.id, outcome: 'failure' })
    return NextResponse.json({ key: presentUserKey(revoked) }, { status: 200 })
  }
  if (computeKeyFingerprint(apiKey) !== record.keyFingerprint) {
    const revoked = await prisma.userLlmKey.update({
      where: { id: record.id },
      data: { status: 'REVOKED', lastErrorCode: 'fingerprint_mismatch', failureCount: record.failureCount + 1, lastCheckedAt: new Date() },
    })
    await logAudit('byok_key_validated', `provider=${providerId} outcome=revoked`, '', { actorId: session.value.id, targetId: record.id, outcome: 'failure' })
    return NextResponse.json({ key: presentUserKey(revoked) }, { status: 200 })
  }

  const probe = await probeByokKey({ provider: providerId, apiKey, keyFingerprint: record.keyFingerprint })
  const now = new Date()
  const failureCount = probe.ok ? 0 : record.failureCount + 1
  const status = probe.ok ? 'ACTIVE' : failureCount >= MAX_FAILURES_BEFORE_REVOKE ? 'REVOKED' : 'FAILED'
  const updated = await prisma.userLlmKey.update({
    where: { id: record.id },
    data: {
      status,
      validatedAt: probe.ok ? now : record.validatedAt,
      lastCheckedAt: now,
      lastErrorCode: probe.errorCode,
      failureCount,
    },
  })
  await logAudit('byok_key_validated', `provider=${providerId} outcome=${probe.ok ? 'active' : status.toLowerCase()}`, '', {
    actorId: session.value.id,
    targetId: record.id,
    outcome: probe.ok ? 'success' : 'failure',
  })
  return NextResponse.json({ key: presentUserKey(updated) }, { status: 200 })
}

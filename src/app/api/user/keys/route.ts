import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logAudit } from '@/lib/security/audit-log'
import { byokConfigured, buildKeyHints, encryptByokKey } from '@/lib/ai/byok-crypto'
import { requireProviderAdapter, probeByokKey, type ModelProviderId } from '@/lib/ai/byok-resolver'
import { ModelConfigurationError } from '@/lib/ai/errors'
import { getDefaultModelRef } from '@/lib/ai/providers/resolve'

const bodySchema = z
  .object({
    provider: z.string().min(1).max(50),
    apiKey: z.string().min(1).max(512),
  })
  .strict()

export function maskFingerprint(fingerprint: string): string {
  const hex = fingerprint.startsWith('sha256:') ? fingerprint.slice('sha256:'.length) : fingerprint
  if (hex.length < 8) return 'sha256:••••'
  return `sha256:${hex.slice(0, 4)}…${hex.slice(-2)}`
}

export type UserKeyRecord = {
  provider: string
  status: string
  keyFingerprint: string
  last4Hint: string
  validatedAt: string | null
  lastCheckedAt: string | null
  lastErrorCode: string | null
  failureCount: number
}

export function presentUserKey(record: {
  provider: string
  status: string
  keyFingerprint: string
  last4Hint: string
  validatedAt: Date | null
  lastCheckedAt: Date | null
  lastErrorCode: string | null
  failureCount: number
}): UserKeyRecord {
  return {
    provider: record.provider,
    status: record.status,
    keyFingerprint: maskFingerprint(record.keyFingerprint),
    last4Hint: record.last4Hint,
    validatedAt: record.validatedAt?.toISOString() ?? null,
    lastCheckedAt: record.lastCheckedAt?.toISOString() ?? null,
    lastErrorCode: record.lastErrorCode,
    failureCount: record.failureCount,
  }
}

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  const records = await prisma.userLlmKey.findMany({
    where: { userId: session.value.id },
    orderBy: { provider: 'asc' },
  })
  return NextResponse.json({ keys: records.map(presentUserKey), configured: byokConfigured() })
}

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  const rateCheck = await checkRateLimit(`byok:user:${session.value.id}`, { windowMs: 60_000, maxRequests: 5 })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before saving another key.' }, { status: 429 })
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
  if (providerId === getDefaultModelRef().provider) {
    // The platform default provider is already available without a personal key.
    return NextResponse.json({ error: 'This provider is already available without a personal key.' }, { status: 400 })
  }
  if (!byokConfigured()) {
    return NextResponse.json({ error: 'Personal keys are not enabled on this deployment.' }, { status: 503 })
  }

  const probe = await probeByokKey({ provider: providerId, apiKey: parsed.data.apiKey })
  const now = new Date()
  if (!probe.ok) {
    return NextResponse.json(
      { error: 'The key was rejected by the provider.', errorCode: probe.errorCode ?? 'unknown', keyFingerprint: maskFingerprint(probe.keyFingerprint) },
      { status: 400 },
    )
  }

  const encrypted = encryptByokKey(parsed.data.apiKey)
  const hints = buildKeyHints(parsed.data.apiKey)
  const record = await prisma.userLlmKey.upsert({
    where: { userId_provider: { userId: session.value.id, provider: providerId } },
    create: {
      userId: session.value.id,
      provider: providerId,
      status: 'ACTIVE',
      ciphertextB64: encrypted.ciphertextB64,
      ivB64: encrypted.ivB64,
      authTagB64: encrypted.authTagB64,
      encVersion: encrypted.encVersion,
      kekId: encrypted.kekId,
      keyFingerprint: probe.keyFingerprint,
      prefixHint: hints.prefixHint,
      last4Hint: hints.last4Hint,
      validatedAt: now,
      lastCheckedAt: now,
      lastErrorCode: null,
      failureCount: 0,
    },
    update: {
      status: 'ACTIVE',
      ciphertextB64: encrypted.ciphertextB64,
      ivB64: encrypted.ivB64,
      authTagB64: encrypted.authTagB64,
      encVersion: encrypted.encVersion,
      kekId: encrypted.kekId,
      keyFingerprint: probe.keyFingerprint,
      prefixHint: hints.prefixHint,
      last4Hint: hints.last4Hint,
      validatedAt: now,
      lastCheckedAt: now,
      lastErrorCode: null,
      failureCount: 0,
    },
  })

  await logAudit('byok_key_saved', `provider=${providerId}`, '', { actorId: session.value.id, targetId: record.id })
  return NextResponse.json({ key: presentUserKey(record) }, { status: 201 })
}

import { byokConfigured, computeKeyFingerprint, decryptByokKey } from '@/lib/ai/byok-crypto'
import { ModelConfigurationError } from '@/lib/ai/errors'
import { getProviderApiKey } from '@/lib/ai/providers/resolve'
import { PROVIDER_REGISTRY } from '@/lib/ai/providers/registry'
import { isProviderId, type ProviderAdapter, type ProviderId } from '@/lib/ai/providers/types'

export type ModelProviderId = ProviderId

export type ByokKeySource = 'user' | 'platform'

export function requireProviderAdapter(raw: string): ProviderAdapter {
  if (!isProviderId(raw)) throw new ModelConfigurationError(`Unknown provider '${raw}'.`)
  return PROVIDER_REGISTRY[raw]
}

export interface ResolvedByokKey {
  apiKey: string | null
  source: ByokKeySource | null
  fingerprint?: string
}

interface ProviderProbe {
  provider: ModelProviderId
  apiKey: string
  source: ByokKeySource
  fingerprint?: string
  lastCheckedAt: number
  failedAt: number | null
  errorCode: string | null
}

const PROBE_TTL_MS = 5 * 60_000
const NEGATIVE_TTL_MS = 30_000
const probeCache = new Map<string, ProviderProbe>()

function probeCacheKey(provider: ModelProviderId, fingerprint: string): string {
  return `${provider}:${fingerprint}`
}

export async function resolveEffectiveApiKey(input: { provider: ModelProviderId; userId?: string }): Promise<ResolvedByokKey> {
  const normalized = requireProviderAdapter(input.provider).id
  if (input.userId) {
    const userKey = await findActiveUserKey(input.userId, normalized)
    if (userKey) return userKey
  }
  const envKey = resolvePlatformKey(normalized)
  if (!envKey) return { apiKey: null, source: null }
  return { apiKey: envKey, source: 'platform' }
}

export async function resolveByokKey(input: { provider: ModelProviderId; userId?: string }): Promise<ResolvedByokKey | null> {
  const resolved = await resolveEffectiveApiKey(input)
  if (!resolved.apiKey || !resolved.source) return null
  return { apiKey: resolved.apiKey, source: resolved.source, fingerprint: resolved.fingerprint }
}

async function findActiveUserKey(userId: string, provider: ModelProviderId): Promise<ResolvedByokKey | null> {
  if (!byokConfigured()) return null
  // Lazy import keeps this module (and its transitive importers) free of a
  // database connection at import time; tests without DATABASE_URL stay green.
  const { prisma } = await import('@/lib/db/prisma')
  const record = await prisma.userLlmKey.findUnique({ where: { userId_provider: { userId, provider } } })
  if (!record || record.status === 'FAILED' || record.status === 'REVOKED') return null
  try {
    const apiKey = decryptByokKey({
      ciphertextB64: record.ciphertextB64,
      ivB64: record.ivB64,
      authTagB64: record.authTagB64,
      encVersion: record.encVersion,
      kekId: record.kekId,
    })
    if (computeKeyFingerprint(apiKey) !== record.keyFingerprint) return null
    return { apiKey, source: 'user', fingerprint: record.keyFingerprint }
  } catch {
    return null
  }
}

export function resolvePlatformKey(provider: ModelProviderId): string | null {
  return getProviderApiKey(provider) ?? null
}

export interface ByokProbeResult {
  keyFingerprint: string
  ok: boolean
  errorCode: string | null
}

async function probeWithListModels(provider: ModelProviderId, apiKey: string): Promise<string | null> {
  try {
    await requireProviderAdapter(provider).listModels(apiKey)
    return null
  } catch (cause) {
    return mapProbeError(cause)
  }
}

export function mapProbeError(cause: unknown): string {
  const status = extractStatusCode(cause)
  if (status === 401 || status === 403) return 'invalid_key'
  if (status === 429) return 'rate_limited'
  if (status !== null && status >= 500) return 'provider_unavailable'
  if (cause instanceof Error && /timeout|econn|enotfound|network|fetch failed/i.test(cause.message)) return 'unreachable'
  return 'unknown'
}

function extractStatusCode(cause: unknown): number | null {
  if (typeof cause !== 'object' || cause === null) return null
  const record = cause as Record<string, unknown>
  for (const key of ['statusCode', 'status']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  const response = record['response']
  if (typeof response === 'object' && response !== null) {
    const status = (response as Record<string, unknown>)['status']
    if (typeof status === 'number' && Number.isFinite(status)) return status
  }
  return null
}

export async function probeByokKey(input: { provider: ModelProviderId; apiKey?: string; keyFingerprint?: string }): Promise<ByokProbeResult> {
  const provider = requireProviderAdapter(input.provider).id
  const apiKey = input.apiKey ?? resolvePlatformKey(provider)
  if (!apiKey) return { keyFingerprint: 'missing', ok: false, errorCode: 'missing_key' }
  const fingerprint = input.keyFingerprint ?? computeKeyFingerprint(apiKey)
  const cached = probeCache.get(probeCacheKey(provider, fingerprint))
  const now = Date.now()
  if (cached) {
    const ttl = cached.failedAt === null ? PROBE_TTL_MS : NEGATIVE_TTL_MS
    if (now - cached.lastCheckedAt < ttl) return { keyFingerprint: fingerprint, ok: cached.failedAt === null, errorCode: cached.errorCode }
  }
  const errorCode = await probeWithListModels(provider, apiKey)
  const ok = errorCode === null
  probeCache.set(probeCacheKey(provider, fingerprint), {
    provider,
    apiKey,
    source: 'platform',
    fingerprint,
    lastCheckedAt: now,
    failedAt: ok ? null : now,
    errorCode,
  })
  return { keyFingerprint: fingerprint, ok, errorCode }
}

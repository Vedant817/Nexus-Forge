import type { ModelCatalogEntry, ProviderId, StructuredOutputCapability } from './types'

const LIST_TIMEOUT_MS = 10_000

// Models that cannot satisfy the Zod structured-output boundary and must
// never be admitted, no matter what a provider list returns.
const EXCLUDED_MODEL_PATTERNS: Array<{ provider: ProviderId; pattern: RegExp; reason: string }> = [
  { provider: 'deepseek', pattern: /reasoner/i, reason: 'no-structured-output' },
  { provider: 'openai', pattern: /^o1-(preview|mini)/i, reason: 'no-structured-output' },
  { provider: 'anthropic', pattern: /thinking|reasoning/i, reason: 'no-structured-output' },
  { provider: 'moonshot', pattern: /thinking|reasoning/i, reason: 'no-structured-output' },
  { provider: 'google', pattern: /vision|embedding|aqa|tunedModels\//i, reason: 'not-a-chat-model' },
]

const NON_CHAT_PREFIXES = ['whisper', 'tts', 'dall-e', 'moderation', 'text-embedding', 'omni-moderation', 'audio-', 'realtime', 'sora', 'gpt-audio']

/** Exported for tests. Returns the exclusion reason, or null when admittable. */
export function isExcludedModel(provider: ProviderId, model: string): string | null {
  for (const rule of EXCLUDED_MODEL_PATTERNS) {
    if (rule.provider === provider && rule.pattern.test(model)) return rule.reason
  }
  const lower = model.toLowerCase()
  if (NON_CHAT_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(`/${prefix}`))) {
    return 'not-a-chat-model'
  }
  return null
}

function capabilityFor(provider: ProviderId, model: string): StructuredOutputCapability {
  if (provider === 'openai' && /^(gpt-4o|gpt-4\.1|o3|o4)/i.test(model)) return 'strict-schema'
  if (provider === 'google' && /^models\/gemini-(2|1\.5)/i.test(model)) return 'strict-schema'
  if (provider === 'anthropic') return 'tool-only'
  if (provider === 'deepseek' || provider === 'moonshot') return 'json-mode'
  return 'unknown'
}

async function fetchJson(url: string, apiKey: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, ...headers }, signal: controller.signal })
    if (!response.ok) {
      const error = new Error(`Model list request failed (${response.status}).`) as Error & { status?: number }
      error.status = response.status
      throw error
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export interface CatalogSyncResult {
  provider: ProviderId
  entries: ModelCatalogEntry[]
  admitted: ModelCatalogEntry[]
  excluded: Array<{ model: string; reason: string }>
  source: 'api-list' | 'curated'
  syncedAt: string
}

function toCatalog(provider: ProviderId, ids: string[], fetchedAt: string): CatalogSyncResult {
  const seen = new Set<string>()
  const admitted: ModelCatalogEntry[] = []
  const excluded: Array<{ model: string; reason: string }> = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    const reason = isExcludedModel(provider, id)
    if (reason) {
      excluded.push({ model: id, reason })
      continue
    }
    admitted.push({
      provider,
      model: id,
      displayName: id,
      structuredOutputCapability: capabilityFor(provider, id),
      source: 'api-list',
      fetchedAt,
    })
  }
  return { provider, entries: admitted, admitted, excluded, source: 'api-list', syncedAt: fetchedAt }
}

export async function fetchOpenAiCompatibleModels(provider: ProviderId, listUrl: string, apiKey: string): Promise<ModelCatalogEntry[]> {
  const body = await fetchJson(listUrl, apiKey) as { data?: Array<{ id?: string }> }
  const ids = Array.isArray(body.data) ? body.data.map((entry) => entry.id ?? '').filter(Boolean) : []
  return toCatalog(provider, ids, new Date().toISOString()).admitted
}

export async function fetchGoogleModels(apiKey: string): Promise<ModelCatalogEntry[]> {
  const body = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`,
    { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) },
  ).then(async (response) => {
    if (!response.ok) {
      const error = new Error(`Model list request failed (${response.status}).`) as Error & { status?: number }
      error.status = response.status
      throw error
    }
    return response.json() as Promise<{ models?: Array<{ name?: string }> }>
  })
  const ids = (body.models ?? [])
    .map((model) => (model.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
  return toCatalog('google', ids, new Date().toISOString()).admitted
}

export async function syncCatalog(provider: ProviderId, apiKey: string): Promise<CatalogSyncResult> {
  const adapter = (await import('./registry')).PROVIDER_REGISTRY[provider]
  const entries = await adapter.listModels(apiKey)
  const admitted: ModelCatalogEntry[] = []
  const excluded: Array<{ model: string; reason: string }> = []
  for (const entry of entries) {
    const reason = isExcludedModel(provider, entry.model)
    if (reason) excluded.push({ model: entry.model, reason })
    else admitted.push(entry)
  }
  const source: 'api-list' | 'curated' = entries.length > 0 && entries.every((entry) => entry.source === 'curated') ? 'curated' : 'api-list'
  return { provider, entries: admitted, admitted, excluded, source, syncedAt: new Date().toISOString() }
}

// 24h in-memory catalog cache keyed by provider. Model IDs are not secret;
// validation of any specific key always live-probes and is never cached.
const catalogCache = new Map<ProviderId, { entries: ModelCatalogEntry[]; fetchedAt: number }>()

export async function getCachedCatalog(provider: ProviderId, apiKey: string, ttlMs = 86_400_000): Promise<{ entries: ModelCatalogEntry[]; fetchedAt: string; stale: boolean }> {
  const cached = catalogCache.get(provider)
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return { entries: cached.entries, fetchedAt: new Date(cached.fetchedAt).toISOString(), stale: false }
  }
  try {
    const entries = await (await import('./registry')).PROVIDER_REGISTRY[provider].listModels(apiKey)
    catalogCache.set(provider, { entries, fetchedAt: Date.now() })
    return { entries, fetchedAt: new Date().toISOString(), stale: false }
  } catch {
    if (cached) return { entries: cached.entries, fetchedAt: new Date(cached.fetchedAt).toISOString(), stale: true }
    throw new Error(`Unable to load ${provider} models. Check the provider key or try again.`)
  }
}

export function clearCatalogCache(provider?: ProviderId): void {
  if (provider) catalogCache.delete(provider)
  else catalogCache.clear()
}

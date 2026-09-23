import { NextResponse } from 'next/server'
import config from '@/lib/config/env'
import { requireSession } from '@/lib/auth/authorization'
import { resolveEffectiveApiKey } from '@/lib/ai/byok-resolver'
import { getCachedCatalog } from '@/lib/ai/providers/model-catalog'
import { isProviderId } from '@/lib/ai/providers/types'
import { checkRateLimit } from '@/lib/security/rate-limit'

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const provider = rawProvider.toLowerCase()
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: `Unknown provider '${rawProvider}'.` }, { status: 400 })
  }

  const rateCheck = await checkRateLimit(`models:user:${session.value.id}:provider:${provider}`, {
    windowMs: 60_000,
    maxRequests: 30,
  })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before refreshing models.' }, { status: 429 })
  }

  const resolved = await resolveEffectiveApiKey({ provider, userId: session.value.id })
  if (!resolved.apiKey) {
    return NextResponse.json(
      { error: `No API key is configured for provider '${provider}'.`, code: 'KEY_MISSING', action: 'Add a key in Settings → AI Models, or ask an admin to configure a platform key.' },
      { status: 409 },
    )
  }

  try {
    const catalog = await getCachedCatalog(provider, resolved.apiKey, config.MODEL_CATALOG_TTL_MS)
    const source = catalog.entries.length > 0 && catalog.entries.every((entry) => entry.source === 'curated')
      ? 'curated-fallback'
      : 'live-list'
    return NextResponse.json({
      provider,
      models: catalog.entries.map((entry) => ({ id: entry.model, displayName: entry.displayName, capability: entry.structuredOutputCapability })),
      fetchedAt: catalog.fetchedAt,
      source,
      stale: catalog.stale,
      ...(provider === 'anthropic'
        ? { warning: 'Anthropic publishes no model-list API, so this is a curated deployment fallback, not a live list. You may enter an exact model ID; unknown IDs are rejected before enqueue.' }
        : {}),
    })
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? (error as { status?: number }).status : undefined
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: `The ${provider} key was rejected (check key and permissions).`, code: 'KEY_INVALID' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: `The ${provider} model list is unreachable right now.`, code: 'PROVIDER_UNREACHABLE' },
      { status: 502 },
    )
  }
}

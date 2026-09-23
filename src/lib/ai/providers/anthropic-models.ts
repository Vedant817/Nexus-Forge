// Anthropic exposes no GET /models list endpoint, so this curated deployment
// fallback is the only model source for the anthropic provider. Refresh by hand
// when Anthropic ships models; unknown IDs are rejected before enqueue.
import type { ModelCatalogEntry } from './types'

const FETCHED_AT = '2026-09-23T00:00:00.000Z'

export const ANTHROPIC_CURATED_MODELS: ModelCatalogEntry[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', structuredOutputCapability: 'tool-only', source: 'curated', fetchedAt: FETCHED_AT },
  { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', displayName: 'Claude Sonnet 3.7', structuredOutputCapability: 'tool-only', source: 'curated', fetchedAt: FETCHED_AT },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', displayName: 'Claude Sonnet 3.5', structuredOutputCapability: 'tool-only', source: 'curated', fetchedAt: FETCHED_AT },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', displayName: 'Claude Haiku 3.5', structuredOutputCapability: 'tool-only', source: 'curated', fetchedAt: FETCHED_AT },
]

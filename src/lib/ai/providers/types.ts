import type { LanguageModel } from 'ai'

export const PROVIDER_IDS = ['groq', 'openai', 'anthropic', 'google', 'moonshot', 'deepseek'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value)
}

export type StructuredOutputCapability =
  | 'unknown'
  | 'strict-schema'
  | 'tool-only'
  | 'json-mode'
  | 'unsupported'

export interface ModelCatalogEntry {
  provider: ProviderId
  model: string
  displayName: string
  structuredOutputCapability: StructuredOutputCapability
  source: 'api-list' | 'curated'
  fetchedAt: string
  deprecated?: boolean
}

export interface ProviderAdapter {
  id: ProviderId
  createModel(model: string, apiKey: string): LanguageModel
  listModels(apiKey: string): Promise<ModelCatalogEntry[]>
  defaultBaseURL?: string
}

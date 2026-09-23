import config from '@/lib/config/env'
import { ModelConfigurationError } from '@/lib/ai/errors'
import { isExcludedModel } from './model-catalog'
import { isProviderId, type ProviderId } from './types'

export interface ResolvedModelRef {
  provider: ProviderId
  model: string
}

function envName(provider: ProviderId): string {
  return provider.toUpperCase()
}

/** Default model for a provider: <P>_MODEL, falling back to legacy GROQ_MODEL for groq. */
export function getProviderDefaultModel(provider: ProviderId): string {
  const specific = config[`${envName(provider)}_MODEL` as keyof typeof config] as string | undefined
  if (specific && specific.trim()) return specific.trim()
  if (provider === 'groq') return config.GROQ_MODEL
  throw new ModelConfigurationError(`No default model configured for provider '${provider}'. Set ${envName(provider)}_MODEL.`)
}

/** Platform default: LLM_PROVIDER (default groq) + LLM_MODEL ?? <P>_MODEL ?? GROQ_MODEL. */
export function getDefaultModelRef(): ResolvedModelRef {
  const rawProvider = (config.LLM_PROVIDER ?? 'groq').trim().toLowerCase()
  if (!isProviderId(rawProvider)) {
    throw new ModelConfigurationError(`Unknown LLM provider '${rawProvider}'. Set LLM_PROVIDER to one of: groq, openai, anthropic, google, moonshot, deepseek.`)
  }
  const override = config.LLM_MODEL?.trim()
  return { provider: rawProvider, model: override || getProviderDefaultModel(rawProvider) }
}

/** Parse "provider:model,..." entries; bare ids apply to every provider. */
function parseAllowlist(raw: string | readonly string[] | undefined): Array<{ provider: ProviderId | null; model: string }> {
  if (!raw) return []
  const items: string[] = typeof raw === 'string' ? raw.split(',') : [...raw]
  return items.map((entry) => entry.trim()).filter(Boolean).map((entry: string) => {
    const separator = entry.indexOf(':')
    if (separator > 0) {
      const provider = entry.slice(0, separator).toLowerCase()
      if (isProviderId(provider)) return { provider, model: entry.slice(separator + 1) }
    }
    return { provider: null as ProviderId | null, model: entry }
  })
}

/**
 * True when an explicit admin allowlist covers the model. Explicit entries
 * are authoritative: no catalog fetch is needed to admit them.
 */
export function isAllowlisted(provider: ProviderId, model: string): boolean {
  const global = parseAllowlist(config.LLM_ALLOWED_MODELS)
  if (global.length > 0) {
    return global.some((entry) => (entry.provider === null || entry.provider === provider) && entry.model === model)
  }
  const scoped = parseAllowlist(config[`${envName(provider)}_ALLOWED_MODELS` as keyof typeof config] as string | readonly string[] | undefined)
  if (scoped.length > 0) {
    return scoped.some((entry) => (entry.provider === null || entry.provider === provider) && entry.model === model)
  }
  if (provider === 'groq') {
    // Legacy path: GROQ_ALLOWED_MODELS defaults to GROQ_MODEL only.
    const allowed = config.GROQ_ALLOWED_MODELS ?? []
    return allowed.includes(model) || model === config.GROQ_MODEL
  }
  return false
}

/**
 * Fail-closed model admission. Precedence: LLM_ALLOWED_MODELS, then
 * <PROVIDER>_ALLOWED_MODELS, then legacy GROQ semantics for groq, then the
 * provider catalog minus structured-output exclusions for everyone else.
 * Non-groq providers without an explicit allowlist entry are admitted here
 * but MUST still pass assertModelAdmitted (live catalog) before enqueue.
 */
export function assertModelAllowed(provider: ProviderId, model: string): void {
  if (!isProviderId(provider)) {
    throw new ModelConfigurationError(`Unknown LLM provider '${provider}'.`)
  }
  if (!model || model.length > 200) {
    throw new ModelConfigurationError('A valid model id is required.')
  }
  const exclusion = isExcludedModel(provider, model)
  if (exclusion) {
    throw new ModelConfigurationError(`Model '${model}' for provider '${provider}' cannot satisfy structured output (${exclusion}).`)
  }
  if (isAllowlisted(provider, model)) return
  if (provider === 'groq') {
    throw new ModelConfigurationError(`Model '${model}' for provider 'groq' is not in GROQ_ALLOWED_MODELS.`)
  }
  // Other providers: catalog membership is verified asynchronously at admission.
}

/** API key for a provider from platform env. BYOK user keys take precedence at call sites. */
export function getProviderApiKey(provider: ProviderId): string | undefined {
  return config[`${envName(provider)}_API_KEY` as keyof typeof config] as string | undefined
}

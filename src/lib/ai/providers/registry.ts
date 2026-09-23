import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import config from '@/lib/config/env'
import type { ProviderAdapter, ProviderId } from './types'
import { fetchGoogleModels, fetchOpenAiCompatibleModels } from './model-catalog'

export const MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1'
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderAdapter> = {
  // Groq path is byte-identical to the pre-multi-provider behavior.
  groq: {
    id: 'groq',
    createModel: (model, apiKey) => createGroq({ apiKey })(model),
    listModels: (apiKey) => fetchOpenAiCompatibleModels('groq', 'https://api.groq.com/openai/v1/models', apiKey),
  },
  openai: {
    id: 'openai',
    createModel: (model, apiKey) => createOpenAI({ apiKey })(model),
    listModels: (apiKey) => fetchOpenAiCompatibleModels('openai', 'https://api.openai.com/v1/models', apiKey),
  },
  anthropic: {
    id: 'anthropic',
    createModel: (model, apiKey) => createAnthropic({ apiKey })(model),
    listModels: async () => {
      const { ANTHROPIC_CURATED_MODELS } = await import('./anthropic-models')
      return ANTHROPIC_CURATED_MODELS
    },
  },
  google: {
    id: 'google',
    createModel: (model, apiKey) => createGoogle({ apiKey })(model),
    listModels: (apiKey) => fetchGoogleModels(apiKey),
  },
  moonshot: {
    id: 'moonshot',
    defaultBaseURL: config.MOONSHOT_BASE_URL,
    createModel: (model, apiKey) => createOpenAICompatible({ baseURL: config.MOONSHOT_BASE_URL, apiKey, name: 'moonshot' })(model),
    listModels: (apiKey) => fetchOpenAiCompatibleModels('moonshot', `${config.MOONSHOT_BASE_URL}/models`, apiKey),
  },
  deepseek: {
    id: 'deepseek',
    defaultBaseURL: config.DEEPSEEK_BASE_URL,
    createModel: (model, apiKey) => createDeepSeek({ apiKey })(model),
    listModels: (apiKey) => fetchOpenAiCompatibleModels('deepseek', `${config.DEEPSEEK_BASE_URL}/models`, apiKey),
  },
}

function assertSpecV4Model(candidate: unknown): asserts candidate is LanguageModel {
  const model = candidate as { specificationVersion?: unknown; doGenerate?: unknown; doStream?: unknown }
  if (model.specificationVersion !== 'v4' || typeof model.doGenerate !== 'function' || typeof model.doStream !== 'function') {
    throw new Error('Provider factory did not return a spec-v4 language model.')
  }
}

export function createLanguageModel(ref: { provider: ProviderId; model: string }, apiKey: string): LanguageModel {
  // The whole tree shares one @ai-sdk/provider copy (see package.json), so
  // this assignment is checked structurally. The spec assertion below is the
  // runtime backstop for future dependency skew.
  const model = PROVIDER_REGISTRY[ref.provider].createModel(ref.model, apiKey)
  assertSpecV4Model(model)
  return model
}

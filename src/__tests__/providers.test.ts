import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('server-only', () => ({}))

import { PROVIDER_IDS, type ProviderId } from '@/lib/ai/providers/types'
import { createLanguageModel, PROVIDER_REGISTRY } from '@/lib/ai/providers/registry'
import { isExcludedModel } from '@/lib/ai/providers/model-catalog'
import { ANTHROPIC_CURATED_MODELS } from '@/lib/ai/providers/anthropic-models'
import { assertModelAllowed, getDefaultModelRef } from '@/lib/ai/providers/resolve'
import { resolveExecutionVersion } from '@/lib/execution/version-registry'
import { MODEL_CONFIG_VERSION, PIPELINE_VERSION, PROMPT_VERSION } from '@/lib/execution/constants'

beforeEach(() => {
  vi.unstubAllGlobals()
  delete process.env.LLM_PROVIDER
  delete process.env.LLM_MODEL
  delete process.env.LLM_ALLOWED_MODELS
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.LLM_PROVIDER
  delete process.env.LLM_MODEL
  delete process.env.LLM_ALLOWED_MODELS
})

describe('provider registry', () => {
  it('covers every declared provider id with a factory', () => {
    expect(Object.keys(PROVIDER_REGISTRY).sort()).toEqual([...PROVIDER_IDS].sort())
    for (const id of PROVIDER_IDS) {
      const model = createLanguageModel({ provider: id, model: 'probe-model' }, 'test-key') as unknown as {
        specificationVersion?: unknown
        doGenerate?: unknown
        doStream?: unknown
      }
      expect(model.specificationVersion).toBe('v4')
      expect(typeof model.doGenerate).toBe('function')
      expect(typeof model.doStream).toBe('function')
    }
  })

  it('rejects unknown provider ids before any network call', () => {
    expect(() => assertModelAllowed('watson' as ProviderId, 'x')).toThrow(/Unknown LLM provider|valid model id|not in/)
  })
})

describe('structured-output exclusions', () => {
  it('excludes reasoning models that cannot satisfy the JSON boundary', () => {
    expect(isExcludedModel('deepseek', 'deepseek-reasoner')).toBe('no-structured-output')
    expect(isExcludedModel('openai', 'o1-preview')).toBe('no-structured-output')
    expect(isExcludedModel('openai', 'o1-mini')).toBe('no-structured-output')
    expect(isExcludedModel('deepseek', 'deepseek-chat')).toBeNull()
    expect(isExcludedModel('openai', 'gpt-4o-mini')).toBeNull()
  })

  it('keeps Anthropic curated-only with an explicit source marker', () => {
    expect(ANTHROPIC_CURATED_MODELS.length).toBeGreaterThan(0)
    for (const entry of ANTHROPIC_CURATED_MODELS) {
      expect(entry.source).toBe('curated')
      expect(entry.provider).toBe('anthropic')
    }
  })
})

describe('model resolution', () => {
  it('defaults to the legacy Groq configuration when LLM_* is unset', () => {
    process.env.GROQ_MODEL = 'legacy-groq-model'
    expect(getDefaultModelRef()).toEqual({ provider: 'groq', model: 'legacy-groq-model' })
    delete process.env.GROQ_MODEL
  })

  it('resolves persisted groq-v1 rows exactly as before', () => {
    process.env.GROQ_ALLOWED_MODELS = 'recorded-model'
    const resolved = resolveExecutionVersion({
      pipelineVersion: PIPELINE_VERSION, promptVersion: PROMPT_VERSION,
      modelConfigVersion: MODEL_CONFIG_VERSION, modelConfig: { provider: 'groq', model: 'recorded-model' },
    })
    expect(resolved).toMatchObject({ provider: 'groq', model: 'recorded-model', enforcementBoundary: 'ai-sdk-json-schema-parser' })
    delete process.env.GROQ_ALLOWED_MODELS
  })

  it('resolves llm-v2 rows for every provider', () => {
    process.env.LLM_ALLOWED_MODELS = PROVIDER_IDS.map((provider) => `${provider}:any-model-id`).join(',')
    for (const provider of PROVIDER_IDS) {
      const resolved = resolveExecutionVersion({
        pipelineVersion: PIPELINE_VERSION, promptVersion: PROMPT_VERSION,
        modelConfigVersion: 'llm-v2', modelConfig: { provider, model: 'any-model-id' },
      })
      expect(resolved).toMatchObject({ provider, enforcementBoundary: 'ai-sdk-json-schema-parser' })
    }
    delete process.env.LLM_ALLOWED_MODELS
  })

  it('fails closed on off-allowlist and excluded models', () => {
    process.env.LLM_ALLOWED_MODELS = 'openai:gpt-4o-mini'
    expect(() => assertModelAllowed('openai', 'gpt-4o')).toThrow(/LLM_ALLOWED_MODELS/)
    expect(() => assertModelAllowed('openai', 'gpt-4o-mini')).not.toThrow()
    expect(() => assertModelAllowed('deepseek', 'deepseek-reasoner')).toThrow(/structured output/)
  })
})

describe('provider interop through ai generateText', () => {
  it('completes structured output against a mocked OpenAI-compatible endpoint', async () => {
    const { generateText, Output } = await import('ai')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1_700_000_000,
      model: 'probe-model',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"answer":42}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const model = createLanguageModel({ provider: 'deepseek', model: 'deepseek-chat' }, 'test-key')
    const result = await generateText({
      model,
      prompt: 'Return the answer.',
      output: Output.object({ schema: z.object({ answer: z.number() }) }),
    })
    expect(result.output).toEqual({ answer: 42 })
  })
})

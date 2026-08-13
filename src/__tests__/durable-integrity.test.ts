import { describe, expect, it } from 'vitest'
import { contentHash, executionVersionHash, stageInputHash } from '@/lib/execution/hash'
import { resolveExecutionVersion } from '@/lib/execution/version-registry'
import { validateWorkerEnvironment } from '@/lib/execution/worker-environment'
import { redactStructuredValue } from '@/lib/security/secret-redaction'
import { checkpointTokenTotals } from '@/lib/execution/token-accounting'
import { MODEL_CONFIG_VERSION, PIPELINE_VERSION, PROMPT_VERSION } from '@/lib/execution/constants'

describe('durable execution integrity', () => {
  it('uses canonical hashes and dependency-derived stage inputs', () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }))
    const base = { runInputHash: 'run', executionVersionHash: 'version', stage: 'WORKFLOW' }
    expect(stageInputHash({ ...base, dependencyOutputHashes: ['a'] }))
      .not.toBe(stageInputHash({ ...base, dependencyOutputHashes: ['b'] }))
    expect(stageInputHash({ ...base, dependencyOutputHashes: ['a'] }))
      .not.toBe(stageInputHash({ ...base, executionVersionHash: 'new-version', dependencyOutputHashes: ['a'] }))
    const version = {
      pipelineVersion: 'v1', promptVersion: 'v1', modelConfigVersion: 'v1',
      modelConfig: { model: 'one' }, stages: { KNOWLEDGE: { promptVersion: '1' } },
    }
    expect(executionVersionHash(version)).not.toBe(executionVersionHash({
      ...version, stages: { KNOWLEDGE: { promptVersion: '2' } },
    }))
  })

  it('rejects values that cannot be represented unambiguously as canonical JSON', () => {
    const sparse = new Array(1)
    const invalid = [undefined, Number.NaN, Infinity, () => undefined, Symbol('x'), BigInt(1), new Date(), sparse]
    for (const value of invalid) expect(() => contentHash(value)).toThrow(/Canonical JSON/)
    expect(() => contentHash([undefined])).toThrow(/Canonical JSON/)
    expect(contentHash([])).not.toBe(contentHash([null]))
    expect(() => contentHash({ value: undefined })).toThrow(/Canonical JSON/)
  })

  it('rejects unsupported tuples/models and resolves an explicitly allowlisted recorded model', () => {
    const previous = process.env.GROQ_ALLOWED_MODELS
    process.env.GROQ_ALLOWED_MODELS = 'llama-3.3-70b-versatile,recorded-model'
    const resolved = resolveExecutionVersion({
      pipelineVersion: PIPELINE_VERSION, promptVersion: PROMPT_VERSION,
      modelConfigVersion: MODEL_CONFIG_VERSION, modelConfig: { provider: 'groq', model: 'recorded-model' },
    })
    expect(resolved).toMatchObject({
      provider: 'groq', model: 'recorded-model',
      structuredOutputCapability: 'unknown',
      enforcementBoundary: 'ai-sdk-json-schema-parser',
      stages: {
        KNOWLEDGE: { promptId: 'knowledge-distiller', promptVersion: '1', schemaVersion: '1' },
      },
    })
    expect(() => resolveExecutionVersion({
      pipelineVersion: 'future', promptVersion: 'evidence-first-v1',
      modelConfigVersion: 'groq-v1', modelConfig: { provider: 'groq', model: 'model' },
    })).toThrow(/Unsupported persisted pipeline/)
    expect(() => resolveExecutionVersion({
      pipelineVersion: PIPELINE_VERSION, promptVersion: PROMPT_VERSION,
      modelConfigVersion: MODEL_CONFIG_VERSION, modelConfig: { provider: 'groq', model: 'unknown-model' },
    })).toThrow(/allowlist/)
    if (previous === undefined) delete process.env.GROQ_ALLOWED_MODELS
    else process.env.GROQ_ALLOWED_MODELS = previous
  })

  it('falls back to reconciled charged tokens when fail-open telemetry is absent', () => {
    expect(checkpointTokenTotals({
      telemetryInputTokens: null,
      telemetryOutputTokens: null,
      telemetryTotalTokens: null,
      reconciledTotalTokens: 20_000,
    })).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 20_000 })
    expect(checkpointTokenTotals({
      telemetryInputTokens: 3,
      telemetryOutputTokens: 4,
      telemetryTotalTokens: 7,
      reconciledTotalTokens: 12,
    })).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 12 })
  })

  it('redacts secrets recursively before persistence', () => {
    const value = redactStructuredValue({ nested: [{ token: `ghp_${'a'.repeat(40)}` }], safe: 7 })
    expect(value).toEqual({ nested: [{ token: '[REDACTED]' }], safe: 7 })
  })
})

describe('worker environment policy', () => {
  it('fails closed for absent or invalid NODE_ENV', () => {
    expect(() => validateWorkerEnvironment({})).toThrow(/NODE_ENV/)
    expect(() => validateWorkerEnvironment({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })

  it('rejects shared GitHub tokens for multi-tenant workers', () => {
    expect(() => validateWorkerEnvironment({ NODE_ENV: 'production', GITHUB_TOKEN: 'shared' })).toThrow(/reject shared/)
    expect(() => validateWorkerEnvironment({ NODE_ENV: 'development' })).not.toThrow()
  })
})

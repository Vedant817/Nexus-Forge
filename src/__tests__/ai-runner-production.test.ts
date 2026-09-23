import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  model: vi.fn((id: string) => ({ specificationVersion: 'v4', provider: 'groq-mock', modelId: id, doGenerate: vi.fn(), doStream: vi.fn() })),
  reserve: vi.fn(),
  reconcile: vi.fn(),
  release: vi.fn(),
  record: vi.fn(),
}))
vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: ({ schema }: { schema: unknown }) => ({ schema }) },
}))
vi.mock('@ai-sdk/groq', () => ({ createGroq: () => mocks.model }))
vi.mock('@/lib/config/env', () => ({ default: {
  GROQ_API_KEY: 'test-key', GROQ_MODEL: 'current-model', GROQ_ALLOWED_MODELS: ['current-model', 'recorded-model'],
} }))
vi.mock('@/lib/ai/inference-policy', () => ({ assertInferenceEnabled: () => {} }))
vi.mock('@/lib/ai/budget', () => ({
  AiBudgetExceededError: class AiBudgetExceededError extends Error {
    readonly code = 'AI_BUDGET_EXCEEDED'
    readonly transient = false
  },
  reserveAiBudget: mocks.reserve,
  reconcileAiBudget: mocks.reconcile,
  releaseAiBudget: mocks.release,
  recordAiUsageEvent: mocks.record,
  getAiMaxOutputTokens: () => 100,
}))

import { AiBudgetExceededError } from '@/lib/ai/budget-errors'
import { runAgentViaAiSdk, VercelAiAgentRunner } from '@/lib/agents/ai-runner'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reserve.mockResolvedValue({ id: 'reservation', reservedTokens: 100, maxOutputTokens: 100 })
  mocks.reconcile.mockResolvedValue(3)
  mocks.release.mockResolvedValue(undefined)
  mocks.record.mockResolvedValue(undefined)
})

describe('production AI SDK boundary', () => {
  it('honors the persisted model override and recursively redacts structured output', async () => {
    mocks.generateText.mockResolvedValue({
      output: { nested: { token: `ghp_${'a'.repeat(40)}` } },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      response: { modelId: 'recorded-model', id: 'response-1' },
      finishReason: 'stop',
      steps: [{}],
    })
    const abortController = new AbortController()
    const output = await runAgentViaAiSdk(
      'System',
      { source: `ghp_${'b'.repeat(40)}` },
      z.object({ nested: z.object({ token: z.string() }) }),
      {
        userId: 'user-1', projectId: 'project-1', operation: 'analysis.test',
        provider: 'groq', model: 'recorded-model', abortSignal: abortController.signal,
      },
    )

    expect(mocks.model).toHaveBeenCalledWith('recorded-model')
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ requestedModel: 'recorded-model' }))
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.objectContaining({ modelId: 'recorded-model', specificationVersion: 'v4' }),
      abortSignal: abortController.signal,
      maxOutputTokens: 100,
      prompt: expect.not.stringContaining(`ghp_${'b'.repeat(40)}`),
    }))
    expect(output).toEqual({ nested: { token: '[REDACTED]' } })
    expect(mocks.reconcile).toHaveBeenCalledOnce()
  })

  it('rejects contextless quality calls before inference or budgeting', async () => {
    const runner = new VercelAiAgentRunner()
    await expect((runner.runQualityPlanner as unknown as (input: unknown) => Promise<unknown>)({}))
      .rejects.toMatchObject({ code: 'AI_CONFIGURATION_ERROR' })
    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
  })

  it('passes through typed budget exhaustion without calling the provider', async () => {
    mocks.reserve.mockRejectedValueOnce(new AiBudgetExceededError('project'))
    const failure = await runAgentViaAiSdk(
      'System', {}, z.object({ ok: z.boolean() }),
      { userId: 'user-1', projectId: 'project-1', operation: 'analysis.test' },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AiBudgetExceededError)
    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      success: false, errorCode: 'AI_BUDGET_EXCEEDED',
    }), undefined)
  })
})

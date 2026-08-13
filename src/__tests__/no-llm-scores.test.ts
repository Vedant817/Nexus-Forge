import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('LLMs do not own evidence scores', () => {
  it('excludes legacy numeric score fields from model schemas and instructions', () => {
    const schemas = read('src/lib/agents/agent-schemas.ts')
    const runner = read('src/lib/agents/ai-runner.ts')
    for (const field of ['maturityScore', 'releaseScore', 'proofScore', 'decision']) {
      expect(schemas).not.toContain(field)
      expect(runner).not.toContain(field)
    }
  })

  it('removes quality-model score and pass/fail ownership and host-shell evaluation', () => {
    const schemas = read('src/lib/agents/quality-agent-schemas.ts')
    const evaluator = read('src/lib/agents/quality-evaluator.ts')
    const orchestrator = read('src/lib/quality/orchestrator.ts')
    expect(schemas).not.toMatch(/score:\s*z\.|passed:\s*z\.|criticalFailure/)
    expect(evaluator).not.toMatch(/execSync|spawn|child_process/)
    expect(evaluator).not.toMatch(/\.passed|criticalFailure|score\s*[:=]/)
    expect(orchestrator).not.toMatch(/evalOutput\.passed|criticalFailure|finalEval\.score/)
  })

  it('keeps criterion evaluation outside model and provider modules', () => {
    const registry = read('src/lib/evidence/registry.ts')
    expect(registry).not.toMatch(/generateText|createGroq|runAgentViaAiSdk/)
  })
})

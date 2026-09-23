import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  knowledgeDistillerOutputSchema,
  proofOfWorkOutputSchema,
  releaseReadinessOutputSchema,
  repoContextAgentOutputSchema,
  workflowPlannerOutputSchema,
} from '@/lib/agents/agent-schemas'
import { qualityEvaluatorOutputSchema } from '@/lib/agents/quality-agent-schemas'

const schemas: Array<[string, z.ZodType]> = [
  ['knowledge', knowledgeDistillerOutputSchema],
  ['repository', repoContextAgentOutputSchema],
  ['workflow', workflowPlannerOutputSchema],
  ['release', releaseReadinessOutputSchema],
  ['proof', proofOfWorkOutputSchema],
  ['quality-evaluator', qualityEvaluatorOutputSchema],
]

function assertStrictCompatible(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => assertStrictCompatible(entry, `${path}[${index}]`))
    return
  }
  if (typeof node !== 'object' || node === null) return
  const record = node as Record<string, unknown>
  // Strict json_schema providers reject any schema carrying a default: such
  // fields are dropped from `required`, which strict mode then refuses.
  expect(record, `${path} must not carry a default`).not.toHaveProperty('default')
  if (record['type'] === 'object' && typeof record['properties'] === 'object' && record['properties'] !== null) {
    const properties = record['properties'] as Record<string, unknown>
    const required = record['required']
    expect(Array.isArray(required), `${path} must list required`).toBe(true)
    for (const key of Object.keys(properties)) {
      expect(required, `${path} required must include ${key}`).toContain(key)
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'properties' || key === 'items' || key === 'additionalProperties') {
      assertStrictCompatible(value, key === 'properties' ? path : `${path}.${key}`)
    }
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      for (const [prop, propSchema] of Object.entries(value as Record<string, unknown>)) {
        assertStrictCompatible(propSchema, `${path}.${prop}`)
      }
    }
  }
}

describe('agent output schemas are strict json_schema compatible', () => {
  it.each(schemas)('%s requires every declared property', (_name, schema) => {
    assertStrictCompatible(z.toJSONSchema(schema), '$')
  })
})

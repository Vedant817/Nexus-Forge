import { describe, expect, it } from 'vitest'
import { canRetryNode, CAPABILITY_GRAPH, topologicalOrder, validateNodeCompletion } from '@/lib/execution/capability-graph'

describe('durable typed scheduler', () => {
  it('uses a fixed deterministic capability order models cannot change', () => {
    expect(topologicalOrder()).toEqual(['KNOWLEDGE', 'REPOSITORY', 'WORKFLOW', 'RELEASE', 'PROOF'])
    expect(CAPABILITY_GRAPH.find((node) => node.name === 'RELEASE')?.optional).toBe(true)
  })

  it('keeps completed evidence nodes valid when optional drafting fails', () => {
    expect(validateNodeCompletion({ KNOWLEDGE: 'SUCCEEDED', REPOSITORY: 'SUCCEEDED', WORKFLOW: 'FAILED', RELEASE: 'SKIPPED', PROOF: 'PENDING' }).ok).toBe(false)
    expect(canRetryNode({ KNOWLEDGE: 'SUCCEEDED', REPOSITORY: 'SUCCEEDED', WORKFLOW: 'FAILED', RELEASE: 'SKIPPED', PROOF: 'PENDING' }, 'WORKFLOW')).toBe(true)
    expect(canRetryNode({ KNOWLEDGE: 'SUCCEEDED', REPOSITORY: 'PENDING', WORKFLOW: 'PENDING', RELEASE: 'SKIPPED', PROOF: 'PENDING' }, 'WORKFLOW')).toBe(false)
  })

  it('requires reconciliation for unknown non-idempotent outcomes', () => {
    expect(validateNodeCompletion({ KNOWLEDGE: 'SUCCEEDED', REPOSITORY: 'UNKNOWN', WORKFLOW: 'PENDING', RELEASE: 'SKIPPED', PROOF: 'PENDING' }).ok).toBe(false)
  })
})

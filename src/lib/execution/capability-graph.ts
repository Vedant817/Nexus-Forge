import { AnalysisStageName } from '@prisma/client'

export type CapabilityNode = {
  name: AnalysisStageName
  dependsOn: AnalysisStageName[]
  optional: boolean
}

export const CAPABILITY_GRAPH: CapabilityNode[] = [
  { name: 'KNOWLEDGE', dependsOn: [], optional: false },
  { name: 'REPOSITORY', dependsOn: ['KNOWLEDGE'], optional: false },
  { name: 'WORKFLOW', dependsOn: ['KNOWLEDGE', 'REPOSITORY'], optional: false },
  { name: 'RELEASE', dependsOn: ['WORKFLOW'], optional: true },
  { name: 'PROOF', dependsOn: ['WORKFLOW'], optional: false },
]

export function topologicalOrder(): AnalysisStageName[] {
  const visited = new Set<AnalysisStageName>()
  const order: AnalysisStageName[] = []
  const visit = (name: AnalysisStageName) => {
    if (visited.has(name)) return
    visited.add(name)
    const node = CAPABILITY_GRAPH.find((candidate) => candidate.name === name)!
    for (const dependency of node.dependsOn) visit(dependency)
    order.push(name)
  }
  for (const node of CAPABILITY_GRAPH) visit(node.name)
  return order
}

export function validateNodeCompletion(statuses: Record<string, string>): { ok: true } | { ok: false; error: string } {
  for (const node of CAPABILITY_GRAPH) {
    const status = statuses[node.name]
    if (!node.optional && status !== 'SUCCEEDED' && status !== 'SKIPPED') {
      return { ok: false, error: `Required node ${node.name} is ${status ?? 'missing'}.` }
    }
  }
  return { ok: true }
}

export function canRetryNode(statuses: Record<string, string>, node: AnalysisStageName): boolean {
  const target = CAPABILITY_GRAPH.find((candidate) => candidate.name === node)
  if (!target) return false
  if (!target.dependsOn.every((dependency) => statuses[dependency] === 'SUCCEEDED' || statuses[dependency] === 'SKIPPED')) return false
  return statuses[node] === 'FAILED' || statuses[node] === 'PENDING'
}

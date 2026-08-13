import { z } from 'zod'

export const ArchitectureGraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.object({ label: z.string(), description: z.string().optional() }),
    type: z.enum(['default', 'input', 'output', 'group']).optional(),
  })),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional(),
    animated: z.boolean().optional(),
  })),
})

const RepositoryGraphInputSchema = z.object({
  architectureSummary: z.string().max(100_000).optional(),
  detectedStack: z.array(z.string().min(1).max(200)).max(100),
  importantFiles: z.array(z.string().min(1).max(500)).max(500),
  likelyFeatureLocations: z.array(z.string().min(1).max(500)).max(500),
  testLocations: z.array(z.string().min(1).max(500)).max(500),
}).strict()

export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>
export type RepositoryGraphInput = z.infer<typeof RepositoryGraphInputSchema>

function normalized(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit)
}

/**
 * Produces a deterministic repository-structure graph. The free-form architecture
 * summary is deliberately ignored: it is untrusted prose, not topology evidence.
 */
export function generateArchitectureGraph(rawInput: RepositoryGraphInput): ArchitectureGraph {
  const input = RepositoryGraphInputSchema.parse(rawInput)
  const groups = [
    { id: 'stack', label: 'Detected stack', values: normalized(input.detectedStack, 30) },
    { id: 'files', label: 'Important files', values: normalized(input.importantFiles, 80) },
    { id: 'features', label: 'Feature locations', values: normalized(input.likelyFeatureLocations, 80) },
    { id: 'tests', label: 'Test locations', values: normalized(input.testLocations, 80) },
  ].filter((group) => group.values.length > 0)

  const nodes: ArchitectureGraph['nodes'] = [{
    id: 'repository',
    position: { x: 0, y: 0 },
    data: { label: 'Repository', description: 'Deterministic repository-analysis root' },
    type: 'input',
  }]
  const edges: ArchitectureGraph['edges'] = []

  groups.forEach((group, groupIndex) => {
    const groupId = `group:${group.id}`
    nodes.push({
      id: groupId,
      position: { x: groupIndex * 320, y: 180 },
      data: { label: group.label, description: `${group.values.length} observed item(s)` },
      type: 'group',
    })
    edges.push({ id: `edge:repository:${group.id}`, source: 'repository', target: groupId })

    group.values.forEach((value, itemIndex) => {
      const nodeId = `${group.id}:${itemIndex}`
      nodes.push({
        id: nodeId,
        position: { x: groupIndex * 320, y: 360 + itemIndex * 120 },
        data: { label: value },
        type: group.id === 'tests' ? 'output' : 'default',
      })
      edges.push({ id: `edge:${group.id}:${itemIndex}`, source: groupId, target: nodeId })
    })
  })

  return ArchitectureGraphSchema.parse({ nodes, edges })
}

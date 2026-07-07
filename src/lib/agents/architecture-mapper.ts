import { generateObject } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { z } from 'zod'

export const ArchitectureGraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    position: z.object({
      x: z.number(),
      y: z.number()
    }),
    data: z.object({
      label: z.string(),
      description: z.string().optional()
    }),
    type: z.enum(['default', 'input', 'output', 'group']).optional()
  })),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional(),
    animated: z.boolean().optional()
  }))
})

export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>

export async function generateArchitectureGraph(architectureSummary: string): Promise<ArchitectureGraph> {
  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })
  
  const prompt = `
    You are a technical architect. I will give you a summary of a codebase's architecture.
    Your task is to convert this into a Node/Edge graph for React Flow to render a visual map of the system.
    
    Rules for Nodes:
    - Make sure to space nodes out realistically in a top-down or left-to-right flow. x and y coordinates should be roughly 250 pixels apart so they don't overlap. (e.g. x: 0, 250, 500, y: 0, 150, 300).
    - Use clear, short labels (e.g. "Frontend", "PostgreSQL", "Auth Service").
    - Provide a short 1-sentence description in the data block.
    
    Rules for Edges:
    - Connect dependencies logically.
    - If data flows or depends heavily, set animated: true.
    
    Architecture Summary:
    ${architectureSummary}
  `

  const { object } = await generateObject({
    model: groq('llama-3.3-70b-versatile'),
    schema: ArchitectureGraphSchema,
    prompt
  })

  return object
}

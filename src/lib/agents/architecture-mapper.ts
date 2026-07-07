import { generateText } from 'ai'
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
    
    OUTPUT ONLY VALID JSON that matches this TypeScript type exactly (do not wrap in markdown blocks like \`\`\`json):
    {
      nodes: { id: string, position: { x: number, y: number }, data: { label: string, description?: string }, type?: 'default' | 'input' | 'output' | 'group' }[],
      edges: { id: string, source: string, target: string, label?: string, animated?: boolean }[]
    }
    
    Architecture Summary:
    ${architectureSummary}
  `

  const { text } = await generateText({
    model: groq('llama-3.3-70b-versatile'),
    prompt
  })

  try {
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanText)
    return ArchitectureGraphSchema.parse(parsed)
  } catch (error) {
    console.error("Failed to parse architecture graph JSON:", text)
    // Fallback empty graph
    return { nodes: [], edges: [] }
  }
}

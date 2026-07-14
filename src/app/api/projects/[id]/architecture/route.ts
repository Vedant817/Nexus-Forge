import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { generateArchitectureGraph } from '@/lib/agents/architecture-mapper'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  try {
    const analysis = await prisma.repoAnalysis.findUnique({
      where: { projectId: id }
    })

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    }

    // Return cached graph if it exists
    if (analysis.graphJson && JSON.stringify(analysis.graphJson) !== '{}') {
      return NextResponse.json(analysis.graphJson)
    }

    // Generate new graph
    if (!analysis.architectureSummary) {
      return NextResponse.json({ error: 'No architecture summary available to graph' }, { status: 400 })
    }

    const graph = await generateArchitectureGraph(analysis.architectureSummary)
    
    // Save generated graph to DB
    await prisma.repoAnalysis.update({
      where: { id: analysis.id },
      data: { graphJson: graph }
    })

    return NextResponse.json(graph)
  } catch (error) {
    console.error('Failed to generate architecture graph:', error)
    return NextResponse.json({ error: 'Failed to generate architecture graph' }, { status: 500 })
  }
}

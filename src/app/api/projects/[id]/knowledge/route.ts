import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const knowledge = await prisma.knowledgeSummary.findUnique({ where: { projectId: id } })
    if (!knowledge) return NextResponse.json({ error: 'No knowledge summary found' }, { status: 404 })
    return NextResponse.json(knowledge)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch knowledge summary' }, { status: 500 })
  }
}

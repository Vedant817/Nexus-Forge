import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const analysis = await prisma.repoAnalysis.findUnique({ where: { projectId: id } })
    if (!analysis) return NextResponse.json({ error: 'No repo analysis found' }, { status: 404 })
    return NextResponse.json(analysis)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch repo analysis' }, { status: 500 })
  }
}

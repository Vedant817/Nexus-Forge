import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const workflow = await prisma.workflow.findUnique({ where: { projectId: id } })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })
    return NextResponse.json(workflow)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const report = await prisma.releaseReport.findUnique({ where: { projectId: id } })
    if (!report) return NextResponse.json({ error: 'No release report found' }, { status: 404 })
    return NextResponse.json(report)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch release report' }, { status: 500 })
  }
}

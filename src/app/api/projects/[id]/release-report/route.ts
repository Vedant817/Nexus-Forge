import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { withCanonicalScore } from '@/lib/evidence/legacy-score-response'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const report = await prisma.releaseReport.findUnique({ where: { projectId: id } })
    if (!report) return NextResponse.json({ error: 'No release report found' }, { status: 404 })
    return NextResponse.json(withCanonicalScore(report, 'releaseScore'))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch release report' }, { status: 500 })
  }
}

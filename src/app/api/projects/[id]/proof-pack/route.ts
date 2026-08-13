import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { withCanonicalScore } from '@/lib/evidence/legacy-score-response'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const proof = await prisma.proofPack.findUnique({ where: { projectId: id } })
    if (!proof) return NextResponse.json({ error: 'No proof pack found' }, { status: 404 })
    return NextResponse.json(withCanonicalScore(proof, 'proofScore'))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch proof pack' }, { status: 500 })
  }
}

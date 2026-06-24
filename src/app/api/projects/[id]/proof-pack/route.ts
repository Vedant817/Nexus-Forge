import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const proof = await prisma.proofPack.findUnique({ where: { projectId: id } })
    if (!proof) return NextResponse.json({ error: 'No proof pack found' }, { status: 404 })
    return NextResponse.json(proof)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch proof pack' }, { status: 500 })
  }
}

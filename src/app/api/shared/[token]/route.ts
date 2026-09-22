import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const link = await prisma.shareLink.findUnique({ where: { tokenHash } })
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Share link is invalid or expired.' }, { status: 404 })
  }
  const run = link.runId
    ? await prisma.analysisRun.findFirst({ where: { id: link.runId, projectId: link.projectId }, select: { id: true, status: true, completedAt: true, admissionDigest: true } })
    : null
  return NextResponse.json({ projectId: link.projectId, run, expiresAt: link.expiresAt })
}

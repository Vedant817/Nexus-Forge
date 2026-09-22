import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const query = url.searchParams.get('query')?.slice(0, 100)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20) || 20))
  const cursor = url.searchParams.get('cursor')
  const runs = await prisma.analysisRun.findMany({
    where: {
      projectId: id, ownerId: access.value.user.id,
      ...(status ? { status: status as never } : {}),
      ...(query ? { id: { contains: query } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, status: true, processingMode: true, inferenceStatus: true, attemptCount: true,
      failureClass: true, failureCode: true, queuedAt: true, startedAt: true, completedAt: true,
      totalTokens: true, admissionDigest: true, pipelineVersion: true,
    },
  })
  const nextCursor = runs.length > limit ? runs[limit].id : null
  return NextResponse.json({ runs: runs.slice(0, limit), nextCursor })
}

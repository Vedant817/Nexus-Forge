import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  const run = await prisma.analysisRun.findFirst({
    where: { id: runId, projectId: id, ownerId: access.value.user.id },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      failureClass: true,
      failureCode: true,
      failureMessage: true,
      queuedAt: true,
      startedAt: true,
      completedAt: true,
      cancelRequestedAt: true,
      cancelledAt: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      stages: {
        orderBy: { ordinal: 'asc' },
        select: {
          stage: true,
          status: true,
          attemptCount: true,
          failureClass: true,
          failureCode: true,
          failureMessage: true,
          startedAt: true,
          completedAt: true,
          totalTokens: true,
        },
      },
    },
  })
  if (!run) return NextResponse.json({ error: 'Analysis run not found' }, { status: 404 })
  return NextResponse.json(run)
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const [queued, running, dead, retryWait] = await Promise.all([
    prisma.job.count({ where: { status: 'QUEUED' } }),
    prisma.job.count({ where: { status: 'RUNNING' } }),
    prisma.job.count({ where: { status: 'DEAD' } }),
    prisma.job.count({ where: { status: 'RETRY_WAIT' } }),
  ])
  const oldest = await prisma.job.findFirst({ where: { status: { in: ['QUEUED', 'RETRY_WAIT'] } }, orderBy: { availableAt: 'asc' }, select: { availableAt: true } })
  const queueAgeMs = oldest ? Math.max(0, Date.now() - oldest.availableAt.getTime()) : 0
  return NextResponse.json({ queued, running, dead, retryWait, queueDepth: queued + retryWait, queueAgeMs, timestamp: new Date().toISOString() })
}

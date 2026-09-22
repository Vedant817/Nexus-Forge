import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const sessions = await prisma.session.findMany({
    where: { userId: session.value.id },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, createdAt: true, ipAddress: true, userAgent: true },
  })
  return NextResponse.json({ sessions, currentSessionId: session.value.sessionId })
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const projects = await prisma.project.findMany({ where: { ownerId: session.value.id }, select: { id: true } })
  const projectIds = projects.map((project) => project.id)
  const events = await prisma.auditLog.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, details: true, projectId: true, createdAt: true },
  })
  return NextResponse.json({ events })
}

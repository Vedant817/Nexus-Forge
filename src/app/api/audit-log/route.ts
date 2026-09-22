import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50))
  const memberships = await prisma.membership.findMany({ where: { userId: session.value.id }, select: { organizationId: true } })
  const orgIds = memberships.map((membership) => membership.organizationId)
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: session.value.id }, { organizationId: { in: orgIds } }] },
    select: { id: true },
  })
  const projectIds = new Set(projects.map((project) => project.id))
  if (projectId && !projectIds.has(projectId)) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const events = await prisma.auditLog.findMany({
    where: {
      OR: [
        { userId: session.value.id },
        { projectId: projectId ? projectId : { in: [...projectIds] } },
        { organizationId: { in: orgIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, action: true, details: true, projectId: true, organizationId: true, targetId: true, requestId: true, interface: true, outcome: true, createdAt: true },
  })
  const nextCursor = events.length > limit ? events[limit].id : null
  return NextResponse.json({ events: events.slice(0, limit), nextCursor })
}

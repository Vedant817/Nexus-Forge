import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

// Administrative SIEM export: organization-scoped, redacted, paginated.
export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const url = new URL(request.url)
  const organizationId = url.searchParams.get('organizationId')
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 })
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } })
  const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: session.value.id } } })
  const role = org?.ownerId === session.value.id ? 'OWNER' : membership?.role
  if (role !== 'OWNER' && role !== 'ADMIN') return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const events = await prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, action: true, outcome: true, requestId: true, createdAt: true, projectId: true, targetId: true },
  })
  return NextResponse.json({ version: 'siem-v1', events })
}

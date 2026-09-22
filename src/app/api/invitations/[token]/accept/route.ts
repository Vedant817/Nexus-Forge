import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { logAudit } from '@/lib/security/audit-log'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash } })
  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Invitation is invalid or expired.' }, { status: 404 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: session.value.id } },
      create: { organizationId: invitation.organizationId, userId: session.value.id, role: invitation.role },
      update: { role: invitation.role },
    })
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })
  })
  await logAudit('membership_changed', 'Invitation accepted', '', { actorId: session.value.id, organizationId: invitation.organizationId, targetId: invitation.id })
  return NextResponse.json({ organizationId: invitation.organizationId, role: invitation.role })
}

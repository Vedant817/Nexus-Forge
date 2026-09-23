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
  // Invitations are addressed to a single email. Accepting with any other
  // identity would silently grant the role to the wrong account (e.g. a
  // forwarded link), so fail closed instead of binding the wrong user.
  if (invitation.email.toLowerCase() !== session.value.email.toLowerCase()) {
    await logAudit('membership_changed', 'Invitation email mismatch', '', {
      actorId: session.value.id,
      organizationId: invitation.organizationId,
      targetId: invitation.id,
      outcome: 'failure',
    })
    return NextResponse.json({ error: 'This invitation was sent to a different email address.' }, { status: 403 })
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

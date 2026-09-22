import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { TENANT_ROLES } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const inviteSchema = z.object({ email: z.string().email().max(200), role: z.enum(TENANT_ROLES) }).strict()

async function requireAdmin(orgId: string, userId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { ownerId: true } })
  if (!org) return null
  if (org.ownerId === userId) return 'OWNER' as const
  const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } } })
  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) return null
  return membership.role
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const role = await requireAdmin(id, session.value.id)
  if (!role) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.invitation.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ])
  return NextResponse.json({ members, invitations: invitations.map((invitation) => ({ ...invitation, tokenHash: undefined })) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const role = await requireAdmin(id, session.value.id)
  if (!role) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 })
  if (parsed.data.role === 'OWNER') return NextResponse.json({ error: 'Ownership transfers use the dedicated endpoint.' }, { status: 400 })
  const token = randomBytes(32).toString('base64url')
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: id, email: parsed.data.email.toLowerCase(), role: parsed.data.role,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  })
  await logAudit('membership_changed', `Invitation created for ${parsed.data.role}`, '', { actorId: session.value.id, organizationId: id, targetId: invitation.id })
  return NextResponse.json({ id: invitation.id, token, expiresAt: invitation.expiresAt }, { status: 201 })
}

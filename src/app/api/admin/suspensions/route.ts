import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { logAudit } from '@/lib/security/audit-log'

const suspensionSchema = z.object({
  organizationId: z.string().min(1).max(100),
  ingestionSuspended: z.boolean().optional(),
  inferenceSuspended: z.boolean().optional(),
  reason: z.string().max(500).default('Administrative suspension.'),
}).strict()

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const parsed = suspensionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid suspension.' }, { status: 400 })
  const org = await prisma.organization.findUnique({ where: { id: parsed.data.organizationId }, select: { ownerId: true } })
  const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: session.value.id } } })
  const role = org?.ownerId === session.value.id ? 'OWNER' : membership?.role
  if (role !== 'OWNER' && role !== 'ADMIN') return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  await prisma.project.updateMany({
    where: { organizationId: parsed.data.organizationId },
    data: {
      ...(parsed.data.ingestionSuspended === true ? { ingestionSuspendedAt: new Date(), ingestionSuspendReason: parsed.data.reason } : {}),
      ...(parsed.data.ingestionSuspended === false ? { ingestionSuspendedAt: null, ingestionSuspendReason: null } : {}),
      ...(parsed.data.inferenceSuspended === true ? { inferenceSuspendedAt: new Date(), inferenceSuspendReason: parsed.data.reason } : {}),
      ...(parsed.data.inferenceSuspended === false ? { inferenceSuspendedAt: null, inferenceSuspendReason: null } : {}),
    },
  })
  await logAudit('support_access', 'Administrative suspension updated', '', { actorId: session.value.id, organizationId: parsed.data.organizationId })
  return NextResponse.json({ updated: true })
}

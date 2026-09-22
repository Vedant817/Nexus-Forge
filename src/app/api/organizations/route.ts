import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { logAudit } from '@/lib/security/audit-log'

const createOrgSchema = z.object({ name: z.string().min(1).max(100) }).strict()

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const parsed = createOrgSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid workspace name.' }, { status: 400 })
  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: { name: parsed.data.name.slice(0, 100), ownerId: session.value.id }, select: { id: true } })
    await tx.membership.create({ data: { organizationId: created.id, userId: session.value.id, role: 'OWNER' } })
    return created
  })
  await logAudit('project_created', 'Workspace created', org.id)
  return NextResponse.json(org, { status: 201 })
}

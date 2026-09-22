import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const scheduleSchema = z.object({ enabled: z.boolean() }).strict()

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'create_run')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = scheduleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid schedule update.' }, { status: 400 })
  const schedule = await prisma.pilotSchedule.upsert({
    where: { projectId: id },
    create: { projectId: id, enabled: parsed.data.enabled, nextRunAt: new Date(Date.now() + 7 * 24 * 3600_000), createdBy: access.value.user.id },
    update: { enabled: parsed.data.enabled, nextRunAt: parsed.data.enabled ? new Date(Date.now() + 7 * 24 * 3600_000) : undefined },
  })
  await logAudit('project_updated', `Schedule ${parsed.data.enabled ? 'enabled' : 'paused'}`, id, { actorId: access.value.user.id })
  return NextResponse.json(schedule)
}

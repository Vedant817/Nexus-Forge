import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'

const triggersSchema = z.object({
  debounceMinutes: z.number().int().min(0).max(120),
  quietStartHour: z.number().int().min(0).max(23).nullable().optional(),
  quietEndHour: z.number().int().min(0).max(23).nullable().optional(),
  materialityThreshold: z.number().int().min(1).max(1000),
  digestEnabled: z.boolean(),
}).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const settings = await prisma.triggerSettings.findUnique({ where: { projectId: id } })
  return NextResponse.json(settings ?? { projectId: id, debounceMinutes: 5, quietStartHour: null, quietEndHour: null, materialityThreshold: 1, digestEnabled: true })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'create_run')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = triggersSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid trigger settings.' }, { status: 400 })
  const settings = await prisma.triggerSettings.upsert({
    where: { projectId: id },
    create: { projectId: id, ...parsed.data },
    update: parsed.data,
  })
  return NextResponse.json(settings)
}

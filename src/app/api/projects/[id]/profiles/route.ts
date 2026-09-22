import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { PRESET_CONTROLS, PROFILE_PRESETS, profileControlsSchema } from '@/lib/pilot/profiles'

const createProfileSchema = z.object({
  name: z.string().min(1).max(100),
  preset: z.enum(PROFILE_PRESETS),
  controls: profileControlsSchema.optional(),
}).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const revisions = await prisma.profileRevision.findMany({ where: { projectId: id }, orderBy: { version: 'desc' }, take: 10 })
  return NextResponse.json({ revisions, presets: PRESET_CONTROLS })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'publish_template')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = createProfileSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid profile.' }, { status: 400 })
  const controls = parsed.data.controls ?? PRESET_CONTROLS[parsed.data.preset]
  const latest = await prisma.profileRevision.findFirst({ where: { projectId: id }, orderBy: { version: 'desc' }, select: { version: true } })
  const revision = await prisma.profileRevision.create({
    data: { projectId: id, name: parsed.data.name.slice(0, 100), preset: parsed.data.preset, controls: controls as never, version: (latest?.version ?? 0) + 1, actorId: access.value.user.id },
  })
  return NextResponse.json(revision, { status: 201 })
}

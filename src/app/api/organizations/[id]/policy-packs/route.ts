import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { logAudit } from '@/lib/security/audit-log'

const packSchema = z.object({
  name: z.string().min(1).max(100),
  thresholds: z.object({
    minCompletenessBasisPoints: z.number().int().min(0).max(10000).default(8000),
    maxFailCount: z.number().int().min(0).max(1000).default(0),
    requireApproval: z.boolean().default(true),
  }).strict(),
}).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const packs = await prisma.policyPack.findMany({ where: { organizationId: id }, orderBy: [{ name: 'asc' }, { version: 'desc' }], take: 50 })
  return NextResponse.json({ packs })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const org = await prisma.organization.findUnique({ where: { id }, select: { ownerId: true } })
  if (!org) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: id, userId: session.value.id } } })
  const role = org.ownerId === session.value.id ? 'OWNER' : membership?.role
  if (role !== 'OWNER' && role !== 'ADMIN') return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const parsed = packSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid policy pack.' }, { status: 400 })
  const latest = await prisma.policyPack.findFirst({ where: { organizationId: id, name: parsed.data.name }, orderBy: { version: 'desc' } })
  const pack = await prisma.policyPack.create({
    data: { organizationId: id, name: parsed.data.name, thresholds: parsed.data.thresholds as never, version: (latest?.version ?? 0) + 1, createdBy: session.value.id },
  })
  await logAudit('approval_decision', `Policy pack ${parsed.data.name} v${pack.version} published`, '', { actorId: session.value.id, organizationId: id, targetId: pack.id })
  return NextResponse.json(pack, { status: 201 })
}

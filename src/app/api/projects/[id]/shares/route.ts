import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

const shareSchema = z.object({ runId: z.string().max(100).nullable().optional(), expiresInHours: z.number().int().min(1).max(720).default(72) }).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const links = await prisma.shareLink.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 20 })
  return NextResponse.json({ links: links.map((link) => ({ ...link, tokenHash: undefined })) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'export_sensitive')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = shareSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid share request.' }, { status: 400 })
  const token = randomBytes(32).toString('base64url')
  const link = await prisma.shareLink.create({
    data: {
      projectId: id, runId: parsed.data.runId ?? undefined,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + parsed.data.expiresInHours * 3600_000),
      createdBy: access.value.user.id,
    },
  })
  await logAudit('export_generated', 'Share link created', id, { actorId: access.value.user.id, targetId: link.id })
  return NextResponse.json({ id: link.id, token, expiresAt: link.expiresAt }, { status: 201 })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const { linkId } = await request.json().catch(() => ({})) as { linkId?: string }
  if (!linkId) return NextResponse.json({ error: 'linkId is required.' }, { status: 400 })
  await prisma.shareLink.updateMany({ where: { id: linkId, projectId: id }, data: { revokedAt: new Date() } })
  await logAudit('export_generated', 'Share link revoked', id, { actorId: access.value.user.id, targetId: linkId })
  return NextResponse.json({ revoked: true })
}

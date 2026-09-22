import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { contentHash } from '@/lib/execution/hash'
import { SECRET_SCANNER_VERSION } from '@/lib/security/secret-scanner'
import { logAudit } from '@/lib/security/audit-log'

const overrideSchema = z.object({ reason: z.string().min(10).max(1000) }).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const parsed = overrideSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'An override reason of at least 10 characters is required.' }, { status: 400 })
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source || source.projectId !== id) return NextResponse.json({ error: 'Source not found' }, { status: 404 })
  if (source.quarantineStatus !== 'QUARANTINED') return NextResponse.json({ error: 'Only quarantined sources require an override.' }, { status: 400 })
  const hash = contentHash(source.rawContent)
  await prisma.$transaction(async (tx) => {
    await tx.secretOverride.upsert({
      where: { projectId_contentHash: { projectId: id, contentHash: hash } },
      create: { projectId: id, contentHash: hash, reason: parsed.data.reason.slice(0, 1000), authorizedBy: access.value.user.id, scannerVersion: SECRET_SCANNER_VERSION },
      update: { reason: parsed.data.reason.slice(0, 1000), authorizedBy: access.value.user.id, scannerVersion: SECRET_SCANNER_VERSION },
    })
    await tx.source.update({ where: { id: sourceId }, data: { quarantineStatus: 'OVERRIDDEN', quarantineReason: `Override by ${access.value.user.id}: ${parsed.data.reason.slice(0, 500)}` } })
  })
  await logAudit('source_added', 'Quarantined source overridden with audited reason', id)
  return NextResponse.json({ overridden: true })
}

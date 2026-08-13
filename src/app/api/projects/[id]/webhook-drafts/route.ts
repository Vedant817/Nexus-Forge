import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const drafts = await prisma.artifactVersion.findMany({
    where: { projectId: id, kind: 'WEBHOOK_PROOF_DRAFT', webhookDeliveryId: { not: null } },
    orderBy: { createdAt: 'desc' }, take: 50,
    select: {
      id: true, content: true, contentHash: true, createdAt: true,
      webhookDelivery: { select: { event: true, action: true, receivedAt: true, payload: true } },
    },
  })
  return NextResponse.json(drafts.map((draft) => ({
    id: draft.id, content: draft.content, contentHash: draft.contentHash, createdAt: draft.createdAt,
    event: draft.webhookDelivery?.event, action: draft.webhookDelivery?.action,
    receivedAt: draft.webhookDelivery?.receivedAt, reviewRequired: true,
  })))
}

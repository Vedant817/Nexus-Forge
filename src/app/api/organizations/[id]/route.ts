import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { logAudit } from '@/lib/security/audit-log'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, ownerId: true } })
  if (!org || org.ownerId !== session.value.id) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  try {
    const { requestWorkspaceDeletion } = await import('@/lib/privacy/deletion')
    const { deletionId } = await requestWorkspaceDeletion({ organizationId: id, actorId: session.value.id })
    await logAudit('project_deleted', 'Workspace deleted', id)
    return NextResponse.json({ success: true, deletionId })
  } catch {
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 })
  }
}

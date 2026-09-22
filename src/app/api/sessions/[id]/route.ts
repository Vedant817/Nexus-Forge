import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { logAudit } from '@/lib/security/audit-log'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  await prisma.session.deleteMany({ where: { id, userId: session.value.id } })
  await logAudit('project_updated', 'Session revoked', '')
  return NextResponse.json({ success: true })
}

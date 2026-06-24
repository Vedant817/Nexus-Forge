import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { logAudit } from '@/lib/security/audit-log'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await params
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } })
    if (!source || source.projectId !== id) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }
    await prisma.source.delete({ where: { id: sourceId } })
    await logAudit('source_deleted', `Source deleted`, id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 })
  }
}

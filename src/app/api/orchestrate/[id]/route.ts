import { NextRequest, NextResponse } from 'next/server'
import { getOrchestration } from '@/lib/quality/orchestrator'
import { requireSession } from '@/lib/auth/authorization'
import { canUseQualityOrchestrator } from '@/lib/quality/access-policy'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req.headers)
  if (!session.ok) return session.response
  if (!canUseQualityOrchestrator(session.value)) {
    return NextResponse.json({ error: 'Orchestration is unavailable' }, { status: 403 })
  }

  const { id } = await params
  const status = getOrchestration(id, session.value.id)
  if (!status) {
    return NextResponse.json({ error: 'Orchestration not found' }, { status: 404 })
  }
  return NextResponse.json({ status })
}

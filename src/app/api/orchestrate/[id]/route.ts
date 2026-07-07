import { NextRequest, NextResponse } from 'next/server'
import { getOrchestration } from '@/lib/quality/orchestrator'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const status = getOrchestration(id)
  if (!status) {
    return NextResponse.json({ error: 'Orchestration not found' }, { status: 404 })
  }
  return NextResponse.json({ status })
}

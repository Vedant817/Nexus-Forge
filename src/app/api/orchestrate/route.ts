import { NextRequest, NextResponse } from 'next/server'
import { startOrchestration, getOrchestration, listOrchestrations } from '@/lib/quality/orchestrator'

export async function POST(req: NextRequest) {
  try {
    const { goal } = await req.json()
    if (!goal || typeof goal !== 'string') {
      return NextResponse.json({ error: 'goal is required (string)' }, { status: 400 })
    }

    const id = await startOrchestration(goal)
    const status = getOrchestration(id)

    return NextResponse.json({ id, status })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to start orchestration: ${err}` },
      { status: 500 },
    )
  }
}

export async function GET() {
  const orchestrations = listOrchestrations()
  return NextResponse.json({ orchestrations })
}

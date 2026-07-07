import { NextRequest, NextResponse } from 'next/server'
import { startOrchestration, getOrchestration, listOrchestrations } from '@/lib/quality/orchestrator'
import { checkRateLimit } from '@/lib/security/rate-limit'

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Orchestration is disabled in production' }, { status: 403 })
    }

    // Apply simple rate limiting just in case
    const ip = req.headers.get('x-forwarded-for') || 'localhost'
    const rateCheck = await checkRateLimit(`orchestrate:${ip}`, { windowMs: 60000, maxRequests: 5 })
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { goal } = await req.json()
    if (!goal || typeof goal !== 'string' || goal.length > 2000) {
      return NextResponse.json({ error: 'goal is required (string, max 2000 chars)' }, { status: 400 })
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
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Orchestration is disabled in production' }, { status: 403 })
  }
  const orchestrations = listOrchestrations()
  return NextResponse.json({ orchestrations })
}

import { NextRequest, NextResponse } from 'next/server'
import { startOrchestration, getOrchestration, listOrchestrations } from '@/lib/quality/orchestrator'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { requireSession } from '@/lib/auth/authorization'
import { canUseQualityOrchestrator } from '@/lib/quality/access-policy'

export async function POST(req: NextRequest) {
  const session = await requireSession(req.headers)
  if (!session.ok) return session.response

  try {
    if (!canUseQualityOrchestrator(session.value)) {
      return NextResponse.json({ error: 'Orchestration is unavailable' }, { status: 403 })
    }

    const rateCheck = await checkRateLimit(`orchestrate:user:${session.value.id}`, { windowMs: 60000, maxRequests: 5 })
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { goal } = await req.json()
    if (!goal || typeof goal !== 'string' || goal.length > 2000) {
      return NextResponse.json({ error: 'goal is required (string, max 2000 chars)' }, { status: 400 })
    }

    const id = await startOrchestration(goal, session.value.id)
    const status = getOrchestration(id, session.value.id)

    return NextResponse.json({ id, status })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to start orchestration: ${err}` },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  if (!canUseQualityOrchestrator(session.value)) {
    return NextResponse.json({ error: 'Orchestration is unavailable' }, { status: 403 })
  }
  const orchestrations = listOrchestrations(session.value.id)
  return NextResponse.json({ orchestrations })
}

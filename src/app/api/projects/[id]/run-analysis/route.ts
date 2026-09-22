import { NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { ActiveAnalysisRunError, enqueueAnalysis } from '@/lib/execution/enqueue-analysis'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  const rateCheck = await checkRateLimit(`analysis:user:${access.value.user.id}:project:${id}`, {
    windowMs: 60_000,
    maxRequests: 3,
  })
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before running analysis again.' },
      { status: 429, headers: { 'X-RateLimit-Reset': String(rateCheck.resetAt) } },
    )
  }

  try {
    const result = await enqueueAnalysis(id, access.value.user.id)
    return NextResponse.json(result, {
      status: 202,
      headers: { Location: `/api/projects/${id}/runs/${result.runId}` },
    })
  } catch (error) {
    if (error instanceof ActiveAnalysisRunError) {
      return NextResponse.json(
        { error: error.message, runId: error.runId, status: 'ACTIVE' },
        { status: 409 },
      )
    }
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Add at least')) return NextResponse.json({ error: message }, { status: 400 })
    if (message === 'Project not found') return NextResponse.json({ error: message }, { status: 404 })
    console.error('[analysis-enqueue] failed to create durable run')
    return NextResponse.json({ error: 'Unable to enqueue analysis safely' }, { status: 500 })
  }
}

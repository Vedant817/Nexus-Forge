import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requestAnalysisCancellation } from '@/lib/execution/cancellation'

const bodySchema = z.object({ reason: z.string().max(500).optional() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  let body: unknown = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cancellation request' }, { status: 400 })

  const result = await requestAnalysisCancellation({
    runId,
    projectId: id,
    ownerId: access.value.user.id,
    reason: parsed.data.reason,
  })
  if (result === 'not_found') return NextResponse.json({ error: 'Analysis run not found' }, { status: 404 })
  if (result === 'terminal') return NextResponse.json({ error: 'Analysis run is already terminal' }, { status: 409 })
  return NextResponse.json({ runId, status: 'CANCEL_REQUESTED' }, { status: 202 })
}

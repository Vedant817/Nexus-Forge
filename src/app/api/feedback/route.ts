import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { requireSession } from '@/lib/auth/authorization'
import { logStructured } from '@/lib/observability/logger'

const feedbackSchema = z.object({ category: z.enum(['bug', 'usability', 'docs', 'other']), message: z.string().min(1).max(2000) }).strict()

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const rateCheck = await checkRateLimit(`feedback:user:${session.value.id}`, { windowMs: 60_000, maxRequests: 5 })
  if (!rateCheck.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid feedback.' }, { status: 400 })
  logStructured('info', 'user feedback received', { action: parsed.data.category })
  return NextResponse.json({ received: true })
}

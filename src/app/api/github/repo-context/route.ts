import { NextResponse } from 'next/server'
import { fetchRepoContext } from '@/lib/github'
import { githubRepoUrlSchema } from '@/lib/security/validation'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { requireSession } from '@/lib/auth/authorization'
import { assertIngestionEnabled } from '@/lib/ai/data-policy'

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  try {
    assertIngestionEnabled()
  } catch {
    return NextResponse.json({ error: 'Ingestion is temporarily disabled.' }, { status: 503 })
  }

  const rateCheck = await checkRateLimit(`github:user:${session.value.id}`, { windowMs: 60000, maxRequests: 30 })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const parsed = githubRepoUrlSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid URL', details: parsed.error.issues }, { status: 400 })
    }

    const context = await fetchRepoContext(parsed.data.url)
    return NextResponse.json(context)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch repo context'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

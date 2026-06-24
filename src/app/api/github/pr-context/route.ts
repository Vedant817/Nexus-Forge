import { NextResponse } from 'next/server'
import { fetchPRContext } from '@/lib/github'
import { githubPrUrlSchema } from '@/lib/security/validation'
import { checkRateLimit } from '@/lib/security/rate-limit'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateCheck = checkRateLimit(`github:${ip}`, { windowMs: 60000, maxRequests: 30 })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const parsed = githubPrUrlSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid URL', details: parsed.error.issues }, { status: 400 })
    }

    const context = await fetchPRContext(parsed.data.url)
    return NextResponse.json(context)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch PR context'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

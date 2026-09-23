import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logAudit } from '@/lib/security/audit-log'
import { requireProviderAdapter } from '@/lib/ai/byok-resolver'
import { ModelConfigurationError } from '@/lib/ai/errors'

export async function DELETE(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  let providerId: string
  try {
    providerId = requireProviderAdapter(provider).id
  } catch (cause) {
    if (cause instanceof ModelConfigurationError) return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 })
    throw cause
  }

  const rateCheck = await checkRateLimit(`byok:user:${session.value.id}`, { windowMs: 60_000, maxRequests: 10 })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before deleting again.' }, { status: 429 })
  }

  const existing = await prisma.userLlmKey.findUnique({
    where: { userId_provider: { userId: session.value.id, provider: providerId } },
    select: { id: true },
  })
  if (existing) {
    await prisma.userLlmKey.delete({ where: { id: existing.id } })
    await logAudit('byok_key_deleted', `provider=${providerId}`, '', { actorId: session.value.id, targetId: existing.id })
  }
  return NextResponse.json({ deleted: true, provider: providerId })
}

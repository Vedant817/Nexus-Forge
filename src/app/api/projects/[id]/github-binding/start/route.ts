import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { getGitHubAppMetadata, getGitHubUserIdentity } from '@/lib/github/onboarding'
import {
  createGitHubOnboardingToken,
  GITHUB_ONBOARDING_COOKIE,
  GITHUB_ONBOARDING_TTL_MS,
  githubOnboardingCookieOptions,
} from '@/lib/github/onboarding-state'
import { hasValidRequestOrigin } from '@/lib/security/request-origin'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'connect_repository')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { checkRateLimit } = await import('@/lib/security/rate-limit')
  const rateCheck = await checkRateLimit(`github-binding:user:${access.value.user.id}`, { windowMs: 60_000, maxRequests: 10 })
  if (!rateCheck.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })

  try {
    const [app] = await Promise.all([
      getGitHubAppMetadata(),
      getGitHubUserIdentity(request.headers, access.value.user.id),
    ])
    const stateId = randomUUID()
    const { token, tokenHash } = createGitHubOnboardingToken(stateId)
    const expiresAt = new Date(Date.now() + GITHUB_ONBOARDING_TTL_MS)
    await prisma.$transaction(async (tx) => {
      await tx.gitHubOnboardingState.updateMany({
        where: { projectId: id, userId: access.value.user.id, status: { in: ['PENDING', 'CALLBACK_VERIFIED'] } },
        data: { status: 'FAILED', failureCode: 'SUPERSEDED' },
      })
      await tx.gitHubOnboardingState.create({
        data: {
          id: stateId,
          tokenHash,
          projectId: id,
          userId: access.value.user.id,
          sessionId: access.value.user.sessionId,
          expiresAt,
        },
      })
    })
    const cookieStore = await cookies()
    cookieStore.set(GITHUB_ONBOARDING_COOKIE, token, githubOnboardingCookieOptions)
    return NextResponse.json({ installUrl: `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new` })
  } catch {
    return NextResponse.json({ error: 'Unable to start GitHub App installation. Verify the App and GitHub login configuration.' }, { status: 503 })
  }
}

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { verifyGitHubInstallationAuthority } from '@/lib/github/onboarding'
import { GITHUB_ONBOARDING_COOKIE, verifyGitHubOnboardingToken } from '@/lib/github/onboarding-state'

function projectRedirect(request: Request, projectId: string, result: 'select' | 'error'): NextResponse {
  const url = new URL(`/projects/${encodeURIComponent(projectId)}`, request.url)
  url.searchParams.set('githubSetup', result)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const cookieStore = await cookies()
  const token = cookieStore.get(GITHUB_ONBOARDING_COOKIE)?.value
  const verifiedToken = token ? verifyGitHubOnboardingToken(token) : null
  if (!verifiedToken) return NextResponse.json({ error: 'GitHub onboarding state is missing or invalid.' }, { status: 400 })

  const state = await prisma.gitHubOnboardingState.findFirst({
    where: {
      id: verifiedToken.stateId,
      tokenHash: verifiedToken.tokenHash,
      userId: session.value.id,
      sessionId: session.value.sessionId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
      project: { ownerId: session.value.id },
    },
  })
  if (!state) return NextResponse.json({ error: 'GitHub onboarding state expired or was already used.' }, { status: 400 })

  const url = new URL(request.url)
  const installationId = url.searchParams.get('installation_id') ?? ''
  const setupAction = url.searchParams.get('setup_action')
  if (!installationId || setupAction === 'request') {
    await prisma.gitHubOnboardingState.updateMany({ where: { id: state.id, status: 'PENDING' }, data: { status: 'FAILED', failureCode: 'INSTALLATION_NOT_APPROVED' } })
    cookieStore.delete(GITHUB_ONBOARDING_COOKIE)
    return projectRedirect(request, state.projectId, 'error')
  }

  try {
    const authority = await verifyGitHubInstallationAuthority({
      headers: request.headers,
      nexusUserId: session.value.id,
      installationId,
    })
    const updated = await prisma.gitHubOnboardingState.updateMany({
      where: { id: state.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: {
        status: 'CALLBACK_VERIFIED',
        installationId: authority.installationId,
        installationAccountId: authority.account.id,
        installationAccountLogin: authority.account.login,
        installationAccountType: authority.account.type,
        repositorySelection: authority.repositorySelection,
        installationPermissions: authority.installationPermissions,
        githubUserId: authority.githubUserId,
        callbackVerifiedAt: new Date(),
      },
    })
    if (updated.count !== 1) {
      const completed = await prisma.gitHubOnboardingState.findFirst({
        where: { id: state.id, tokenHash: verifiedToken.tokenHash, status: 'CALLBACK_VERIFIED' },
        select: { id: true },
      })
      if (!completed) throw new Error('GitHub onboarding callback was already consumed.')
    }
    return projectRedirect(request, state.projectId, 'select')
  } catch {
    await prisma.gitHubOnboardingState.updateMany({ where: { id: state.id, status: 'PENDING' }, data: { status: 'FAILED', failureCode: 'AUTHORITY_VERIFICATION_FAILED' } })
    cookieStore.delete(GITHUB_ONBOARDING_COOKIE)
    return projectRedirect(request, state.projectId, 'error')
  }
}

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { createInstallationToken, invalidateInstallationTokens } from '@/lib/github/app-auth'
import { githubJson } from '@/lib/github/http'
import {
  listAuthorizedGitHubRepositories,
  verifyAuthorizedGitHubRepository,
  verifyGitHubInstallationAuthority,
} from '@/lib/github/onboarding'
import { GITHUB_ONBOARDING_COOKIE, verifyGitHubOnboardingToken } from '@/lib/github/onboarding-state'
import { hasValidRequestOrigin } from '@/lib/security/request-origin'

const selectionSchema = z.object({ repositoryId: z.string().regex(/^[1-9]\d*$/) }).strict()

async function verifiedState(projectId: string, user: { id: string; sessionId: string }) {
  const token = (await cookies()).get(GITHUB_ONBOARDING_COOKIE)?.value
  const verifiedToken = token ? verifyGitHubOnboardingToken(token) : null
  if (!verifiedToken) return null
  return prisma.gitHubOnboardingState.findFirst({
    where: {
      id: verifiedToken.stateId,
      tokenHash: verifiedToken.tokenHash,
      projectId,
      userId: user.id,
      sessionId: user.sessionId,
      status: 'CALLBACK_VERIFIED',
      expiresAt: { gt: new Date() },
    },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const state = await verifiedState(id, access.value.user)
  if (!state?.installationId) return NextResponse.json({ error: 'Verified GitHub onboarding is required.' }, { status: 409 })
  try {
    const authority = await verifyGitHubInstallationAuthority({ headers: request.headers, nexusUserId: access.value.user.id, installationId: state.installationId })
    const repositories = await listAuthorizedGitHubRepositories(authority)
    return NextResponse.json({ repositories })
  } catch {
    return NextResponse.json({ error: 'Unable to list repositories for this GitHub installation.' }, { status: 403 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid GitHub repository selection' }, { status: 400 })
  const state = await verifiedState(id, access.value.user)
  if (!state?.installationId) return NextResponse.json({ error: 'Verified GitHub onboarding is required.' }, { status: 409 })

  try {
    const lifecycleBefore = await prisma.gitHubInstallationLifecycle.findUnique({
      where: { installationId: state.installationId },
      select: { revision: true },
    })
    const authority = await verifyGitHubInstallationAuthority({ headers: request.headers, nexusUserId: access.value.user.id, installationId: state.installationId })
    const selected = await verifyAuthorizedGitHubRepository(authority, parsed.data.repositoryId)
    const installation = await createInstallationToken({ installationId: authority.installationId, repositoryId: selected.id, forceRefresh: true })
    const canonical = await githubJson<{ id: number; full_name: string }>(`/repositories/${selected.id}`, { token: installation.token })
    if (String(canonical.id) !== selected.id || canonical.full_name.toLowerCase() !== selected.fullName.toLowerCase()) {
      throw new Error('GitHub repository identity mismatch.')
    }
    const observedAt = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${authority.installationId}, 0))`
      const lifecycle = await tx.gitHubInstallationLifecycle.findUnique({
        where: { installationId: authority.installationId },
        select: { revision: true },
      })
      if ((lifecycle?.revision ?? 0) !== (lifecycleBefore?.revision ?? 0)) {
        throw new Error('GitHub installation authority changed during repository verification.')
      }
      const consumed = await tx.gitHubOnboardingState.updateMany({
        where: { id: state.id, status: 'CALLBACK_VERIFIED', expiresAt: { gt: observedAt } },
        data: { status: 'CONSUMED', consumedAt: observedAt },
      })
      if (consumed.count !== 1) throw new Error('GitHub onboarding selection was already consumed.')
      await tx.project.update({
        where: { id, ownerId: access.value.user.id },
        data: {
          githubInstallationId: authority.installationId,
          githubRepositoryId: selected.id,
          githubRepositoryFullName: canonical.full_name.toLowerCase(),
          githubBindingStatus: 'active',
          githubBindingDisabledAt: null,
          githubInstallationAccountId: authority.account.id,
          githubInstallationAccountLogin: authority.account.login,
          githubInstallationAccountType: authority.account.type,
          githubInstallationRepositorySelection: authority.repositorySelection,
          githubInstallationPermissions: authority.installationPermissions,
          githubAuthorizedByGithubUserId: authority.githubUserId,
          githubAuthorizedByUserId: access.value.user.id,
          githubBindingLastReconciledAt: observedAt,
          githubBindingReconciliationError: null,
          repoUrl: `https://github.com/${canonical.full_name}`,
          editRevision: { increment: 1 },
        },
      })
      await tx.repositoryPermissionSnapshot.create({
        data: {
          projectId: id,
          installationId: authority.installationId,
          repositoryId: selected.id,
          repositoryFullName: canonical.full_name.toLowerCase(),
          installationPermissions: authority.installationPermissions,
          userRepositoryPermissions: selected.permissions,
          repositorySelection: authority.repositorySelection,
          observedAt,
          source: 'onboarding',
        },
      })
    })
    ;(await cookies()).delete(GITHUB_ONBOARDING_COOKIE)
    return NextResponse.json({ connected: true, repositoryFullName: canonical.full_name.toLowerCase() })
  } catch {
    return NextResponse.json({ error: 'Unable to verify administrator authority for this repository.' }, { status: 403 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  if (!hasValidRequestOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const project = await prisma.project.findUnique({ where: { id, ownerId: access.value.user.id }, select: { githubInstallationId: true } })
  if (project?.githubInstallationId) invalidateInstallationTokens(project.githubInstallationId)
  await prisma.$transaction(async (tx) => {
    await tx.gitHubOnboardingState.updateMany({ where: { projectId: id, status: { in: ['PENDING', 'CALLBACK_VERIFIED'] } }, data: { status: 'FAILED', failureCode: 'DISCONNECTED' } })
    await tx.project.update({
      where: { id, ownerId: access.value.user.id },
      data: {
        githubBindingStatus: 'disconnected',
        githubBindingDisabledAt: new Date(),
        githubInstallationId: null,
        githubRepositoryId: null,
        githubInstallationAccountId: null,
        githubInstallationAccountLogin: null,
        githubInstallationAccountType: null,
        githubInstallationRepositorySelection: null,
        githubInstallationPermissions: Prisma.DbNull,
        githubAuthorizedByGithubUserId: null,
        githubAuthorizedByUserId: null,
        githubBindingLastReconciledAt: null,
        githubBindingReconciliationError: null,
      },
    })
  })
  ;(await cookies()).delete(GITHUB_ONBOARDING_COOKIE)
  return NextResponse.json({ connected: false })
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { updateProjectSchema } from '@/lib/security/validation'
import { logAudit } from '@/lib/security/audit-log'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { resolveRepositoryIdentity } from '@/lib/github/repository-identity'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const project = await prisma.project.findUnique({
      where: { id, ownerId: access.value.user.id },
      include: {
        sources: true,
        knowledge: true,
        repoAnalysis: true,
        workflow: true,
        releaseReport: true,
        proofPack: true,
        analysisRuns: {
          where: { status: { in: ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, attemptCount: true, failureClass: true, failureMessage: true, stages: { orderBy: { ordinal: 'asc' }, select: { stage: true, status: true, attemptCount: true, failureMessage: true } } },
        },
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const parsed = updateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const current = await prisma.project.findUnique({
      where: { id },
      select: { repoUrl: true, prUrl: true, githubBindingStatus: true, githubRepositoryFullName: true },
    })
    if (!current) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const identity = resolveRepositoryIdentity(
      parsed.data.repoUrl ?? current.repoUrl,
      parsed.data.prUrl ?? current.prUrl,
    )
    if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 400 })
    if (
      current.githubBindingStatus === 'active'
      && current.githubRepositoryFullName
      && identity.fullName !== current.githubRepositoryFullName
    ) {
      return NextResponse.json({ error: 'Disconnect or change the verified GitHub App connection before changing repository identity.' }, { status: 409 })
    }

    const project = await prisma.project.update({
      where: { id, ownerId: access.value.user.id },
      data: { ...parsed.data, githubRepositoryFullName: identity.fullName },
    })
    await logAudit('project_updated', `Project updated`, id)
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    await prisma.project.delete({ where: { id, ownerId: access.value.user.id } })
    await logAudit('project_deleted', `Project deleted`, id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}

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
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, status: true, attemptCount: true, failureClass: true, failureCode: true,
            failureMessage: true, queuedAt: true, startedAt: true, completedAt: true, cancelledAt: true,
            stages: {
              orderBy: { ordinal: 'asc' },
              select: {
                stage: true, status: true, attemptCount: true, failureClass: true, failureCode: true,
                failureMessage: true, startedAt: true, completedAt: true,
              },
            },
          },
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
      select: { repoUrl: true, prUrl: true, editRevision: true, githubBindingStatus: true, githubRepositoryFullName: true },
    })
    if (!current) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const { expectedRevision, ...changes } = parsed.data
    if (expectedRevision !== current.editRevision) {
      return NextResponse.json({ error: 'Project changed in another session. Reload before saving.', currentRevision: current.editRevision }, { status: 409 })
    }

    const identity = resolveRepositoryIdentity(
      changes.repoUrl ?? current.repoUrl,
      changes.prUrl ?? current.prUrl,
    )
    if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 400 })
    if (
      current.githubBindingStatus === 'active'
      && current.githubRepositoryFullName
      && identity.fullName !== current.githubRepositoryFullName
    ) {
      return NextResponse.json({ error: 'Disconnect or change the verified GitHub App connection before changing repository identity.' }, { status: 409 })
    }

    const updated = await prisma.project.updateMany({
      where: { id, ownerId: access.value.user.id, editRevision: current.editRevision },
      data: { ...changes, githubRepositoryFullName: identity.fullName, editRevision: { increment: 1 } },
    })
    if (updated.count !== 1) return NextResponse.json({ error: 'Project changed in another session. Reload before saving.' }, { status: 409 })
    const project = await prisma.project.findUnique({ where: { id, ownerId: access.value.user.id } })
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
  const { requireTenantAction } = await import('@/lib/auth/tenancy')
  const tenant = await requireTenantAction(id, access.value.user.id, 'manage_members')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })

  try {
    const { requestProjectDeletion } = await import('@/lib/privacy/deletion')
    const { deletionId } = await requestProjectDeletion({ projectId: id, actorId: access.value.user.id })
    await logAudit('project_deleted', `Project deleted`, id)
    return NextResponse.json({ success: true, deletionId })
  } catch {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}

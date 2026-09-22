import prisma from '@/lib/db/prisma'
import { getOrCreateTenantKey, keyedDigest } from '@/lib/privacy/tenant-keys'

async function revokeProject(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], projectId: string): Promise<void> {
  await tx.project.updateMany({
    where: { id: projectId },
    data: {
      status: 'deletion_pending',
      ingestionSuspendedAt: new Date(),
      ingestionSuspendReason: 'Deletion requested.',
      inferenceSuspendedAt: new Date(),
      inferenceSuspendReason: 'Deletion requested.',
      githubBindingStatus: 'disconnected',
      githubBindingDisabledAt: new Date(),
      githubInstallationId: null,
      githubRepositoryId: null,
    },
  })
  await tx.analysisRun.updateMany({
    where: { projectId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCEL_REQUESTED', cancelRequestedAt: new Date(), cancellationReason: 'Deletion requested.' },
  })
  await tx.job.updateMany({
    where: { projectId, status: { in: ['QUEUED', 'RETRY_WAIT', 'RUNNING'] } },
    data: { status: 'CANCELLED', completedAt: new Date(), leaseOwner: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null },
  })
}

async function purgeProjectContent(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], projectId: string): Promise<void> {
  const runs = await tx.analysisRun.findMany({ where: { projectId }, select: { id: true } })
  const runIds = runs.map((run) => run.id)
  if (runIds.length) {
    const scorecards = await tx.scorecard.findMany({ where: { analysisRunId: { in: runIds } }, select: { id: true } })
    const scorecardIds = scorecards.map((scorecard) => scorecard.id)
    if (scorecardIds.length) {
      const results = await tx.criterionResult.findMany({ where: { scorecardId: { in: scorecardIds } }, select: { id: true } })
      const resultIds = results.map((result) => result.id)
      if (resultIds.length) await tx.criterionResultEvidence.deleteMany({ where: { criterionResultId: { in: resultIds } } })
      await tx.criterionResult.deleteMany({ where: { scorecardId: { in: scorecardIds } } })
    }
    await tx.scorecard.deleteMany({ where: { analysisRunId: { in: runIds } } })
    await tx.evidenceRecord.deleteMany({ where: { analysisRunId: { in: runIds } } })
    await tx.artifactVersion.deleteMany({ where: { analysisRunId: { in: runIds } } })
    const snapshots = await tx.repositorySnapshot.findMany({ where: { analysisRunId: { in: runIds } }, select: { id: true } })
    const snapshotIds = snapshots.map((snapshot) => snapshot.id)
    if (snapshotIds.length) await tx.repositoryFile.deleteMany({ where: { snapshotId: { in: snapshotIds } } })
    await tx.repositorySnapshot.deleteMany({ where: { analysisRunId: { in: runIds } } })
    await tx.analysisStageRun.deleteMany({ where: { analysisRunId: { in: runIds } } })
  }
  await tx.scorecard.deleteMany({ where: { projectId } })
  await tx.evidenceRecord.deleteMany({ where: { projectId } })
  await tx.artifactVersion.deleteMany({ where: { projectId } })
  await tx.pullRequestSnapshot.deleteMany({ where: { projectId } })
  await tx.repositorySnapshot.deleteMany({ where: { projectId } })
  await tx.job.deleteMany({ where: { projectId } })
  await tx.analysisRun.deleteMany({ where: { projectId } })
  await tx.webhookDelivery.deleteMany({ where: { projectId } })
  await tx.aiUsageEvent.deleteMany({ where: { projectId } })
  await tx.knowledgeSummary.deleteMany({ where: { projectId } })
  await tx.repoAnalysis.deleteMany({ where: { projectId } })
  await tx.workflow.deleteMany({ where: { projectId } })
  await tx.releaseReport.deleteMany({ where: { projectId } })
  await tx.proofPack.deleteMany({ where: { projectId } })
  await tx.source.deleteMany({ where: { projectId } })
  await tx.gitHubOnboardingState.deleteMany({ where: { projectId } })
  await tx.repositoryPermissionSnapshot.deleteMany({ where: { projectId } })
  await tx.secretOverride.deleteMany({ where: { projectId } })
}

export async function requestProjectDeletion(input: { projectId: string; actorId: string; reason?: string }): Promise<{ deletionId: string }> {
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true, ownerId: true, organizationId: true } })
  if (!project) throw new Error('Project not found')
  const organizationId = project.organizationId
  const deletion = await prisma.deletionRequest.create({
    data: { organizationId, projectId: input.projectId, scope: 'project', status: 'PENDING', requestedBy: input.actorId, reason: input.reason?.slice(0, 1000) },
    select: { id: true },
  })
  await prisma.$transaction(async (tx) => {
    await revokeProject(tx, input.projectId)
    await tx.deletionRequest.update({ where: { id: deletion.id }, data: { status: 'IN_PROGRESS' } })
    await purgeProjectContent(tx, input.projectId)
    await tx.project.delete({ where: { id: input.projectId } })
    let tombstone: Record<string, unknown> = { scope: 'project', deletedAt: new Date().toISOString() }
    if (organizationId) {
      const { keyId, keyMaterial } = await getOrCreateTenantKey(organizationId)
      tombstone = {
        ...tombstone,
        keyId,
        organizationDigest: keyedDigest(keyMaterial, organizationId),
        projectDigest: keyedDigest(keyMaterial, input.projectId),
      }
    }
    await tx.deletionRequest.update({ where: { id: deletion.id }, data: { status: 'COMPLETED', completedAt: new Date(), tombstone: tombstone as never } })
  })
  return { deletionId: deletion.id }
}

export async function requestWorkspaceDeletion(input: { organizationId: string; actorId: string; reason?: string }): Promise<{ deletionId: string }> {
  const org = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, ownerId: true } })
  if (!org) throw new Error('Workspace not found')
  const deletion = await prisma.deletionRequest.create({
    data: { organizationId: input.organizationId, scope: 'workspace', status: 'PENDING', requestedBy: input.actorId, reason: input.reason?.slice(0, 1000) },
    select: { id: true },
  })
  const projects = await prisma.project.findMany({ where: { organizationId: input.organizationId }, select: { id: true } })
  await prisma.$transaction(async (tx) => {
    await tx.deletionRequest.update({ where: { id: deletion.id }, data: { status: 'IN_PROGRESS' } })
    for (const project of projects) {
      await revokeProject(tx, project.id)
      await purgeProjectContent(tx, project.id)
      await tx.project.delete({ where: { id: project.id } })
    }
    await tx.membership.deleteMany({ where: { organizationId: input.organizationId } })
    await tx.invitation.deleteMany({ where: { organizationId: input.organizationId } })
    const { keyId, keyMaterial } = await getOrCreateTenantKey(input.organizationId)
    const tombstone = {
      scope: 'workspace',
      keyId,
      organizationDigest: keyedDigest(keyMaterial, input.organizationId),
      projectCount: projects.length,
      deletedAt: new Date().toISOString(),
    }
    await tx.deletionRequest.update({ where: { id: deletion.id }, data: { status: 'COMPLETED', completedAt: new Date(), tombstone: tombstone as never } })
    await tx.tenantKey.updateMany({ where: { organizationId: input.organizationId }, data: { keyMaterial: null, destroyedAt: new Date() } })
    await tx.organization.delete({ where: { id: input.organizationId } })
  })
  return { deletionId: deletion.id }
}

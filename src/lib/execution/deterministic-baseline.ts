import 'server-only'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { contentHash } from '@/lib/execution/hash'
import { collectRunEvidence, pullRequestFactsFromContext, repositoryFactsFromContext } from '@/lib/evidence/collectors'
import { persistEvidenceScorecards } from '@/lib/evidence/persistence'
import { collectPullRequestContext } from '@/lib/github/pull-request-snapshot'
import { collectRepositorySnapshot, persistRepositorySnapshot, repositoryContextFromSnapshot } from '@/lib/github/repository-snapshot'
import { buildDependencyMap } from '@/lib/repository/dependency-map'
import { fenceJobLease, LeaseLostError, type ClaimedJob } from '@/lib/execution/job-repository'
import { verifyAdmissionManifest } from '@/lib/execution/preflight'
import { AnalysisCancelledError } from '@/lib/execution/worker-core'

export async function publishDeterministicBaseline(job: ClaimedJob, signal: AbortSignal): Promise<{ commitSha?: string }> {
  if (!job.analysisRunId) throw new Error('Analysis job is missing analysisRunId.')
  const run = await prisma.analysisRun.findFirst({ where: { id: job.analysisRunId, projectId: job.projectId, ownerId: job.ownerId } })
  if (!run) throw new Error('Persisted analysis job relationships are invalid.')
  verifyAdmissionManifest(run)
  if (run.ledgerSealedAt) return { commitSha: run.commitSha ?? undefined }
  const snapshot = (run.inputSnapshot as { project: { name: string; goal: string; repoUrl: string; prUrl: string; githubRepositoryFullName?: string | null; githubRepositoryId?: string | null; githubInstallationId?: string | null; githubBindingStatus?: string }; sources: Array<{ id: string; type: string; title: string; content: string }> })
  if (contentHash(snapshot) !== run.inputHash) throw new Error('Analysis snapshot integrity validation failed.')

  const project = await prisma.project.findFirst({ where: { id: job.projectId, ownerId: job.ownerId } })
  if (!project) throw new Error('Persisted analysis project relationship is invalid.')
  if (project.ingestionSuspendedAt) throw new Error('Ingestion is suspended for this project.')

  const bindingActive = project.githubBindingStatus === 'active' && project.githubInstallationId && project.githubRepositoryId
  let repositoryFacts: ReturnType<typeof repositoryFactsFromContext> | undefined
  let pullRequestFacts: ReturnType<typeof pullRequestFactsFromContext> | undefined
  let commitSha: string | undefined
  let repositoryFiles: Array<{ path: string; contentHash: string }> | undefined
  let dependencyMap: ReturnType<typeof buildDependencyMap> | undefined

  if (snapshot.project.repoUrl && bindingActive) {
    const excludedPaths = Array.isArray((project as { excludedPaths?: unknown }).excludedPaths) ? (project as { excludedPaths: string[] }).excludedPaths : []
    const collected = await collectRepositorySnapshot({
      installationId: snapshot.project.githubInstallationId!,
      repositoryId: snapshot.project.githubRepositoryId!,
      expectedFullName: snapshot.project.githubRepositoryFullName ?? undefined,
      pinnedCommitSha: run.commitSha ?? undefined,
      excludedPaths,
      signal,
    })
    await persistRepositorySnapshot({
      projectId: job.projectId,
      analysisRunId: job.analysisRunId,
      installationId: snapshot.project.githubInstallationId!,
      repositoryId: snapshot.project.githubRepositoryId!,
      snapshot: collected,
    })
    repositoryFacts = repositoryFactsFromContext(repositoryContextFromSnapshot(collected))
    commitSha = collected.commitSha
    const files = collected.files.filter((file) => file.status === 'collected' && file.content && file.contentHash && (file.path.endsWith('.ts') || file.path.endsWith('.tsx') || file.path.endsWith('.js') || file.path.endsWith('.jsx')))
    repositoryFiles = files.slice(0, 500).map((file) => ({ path: file.path, contentHash: file.contentHash! }))
    if (files.length) {
      dependencyMap = buildDependencyMap({
        repositoryFullName: collected.repositoryFullName,
        commitSha: collected.commitSha,
        snapshotComplete: collected.complete,
        files: files.slice(0, 500).map((file) => ({ path: file.path, content: file.content!, contentHash: file.contentHash! })),
      })
    }
  }

  let pullRequestSnapshot: {
    pullNumber: number; headSha: string; baseSha: string; mergedCommitSha: string | null;
    files: Array<{ path: string; additions: number; deletions: number }>;
    checks: Array<{ name: string; status: string; conclusion: string | null }>;
    reviews: Array<{ reviewId: string; state: string; submittedAt: string | null }>;
    complete: boolean; diagnostics: string[]
  } | undefined
  if (snapshot.project.prUrl && bindingActive && snapshot.project.githubRepositoryFullName) {
    try {
      const pr = await collectPullRequestContext({
        url: snapshot.project.prUrl,
        installationId: snapshot.project.githubInstallationId!,
        repositoryId: snapshot.project.githubRepositoryId!,
        expectedFullName: snapshot.project.githubRepositoryFullName,
        signal,
      })
      pullRequestFacts = pullRequestFactsFromContext({ title: pr.title, body: pr.body, changedFiles: pr.changedFiles, diff: pr.diff, additions: pr.additions, deletions: pr.deletions, fileListComplete: pr.fileListComplete, checksComplete: pr.checksComplete, checks: pr.checks, reviewsComplete: pr.reviewsComplete, reviews: pr.reviews, headSha: pr.headSha })
      const { parseGitHubPrUrl } = await import('@/lib/security/url-safety')
      const parsed = parseGitHubPrUrl(snapshot.project.prUrl)
      pullRequestSnapshot = {
        pullNumber: parsed.ok ? parsed.data.pullNumber : 0,
        headSha: pr.headSha, baseSha: pr.baseSha, mergedCommitSha: pr.mergedCommitSha,
        files: pr.changedFiles.slice(0, 3000).map((path) => ({ path: path.slice(0, 500), additions: 0, deletions: 0 })),
        checks: pr.checks.slice(0, 100).map((check) => ({ name: check.name.slice(0, 300), status: check.status, conclusion: check.conclusion })),
        reviews: pr.reviews.slice(0, 100).map((review) => ({ reviewId: review.id, state: review.state, submittedAt: review.submittedAt })),
        complete: pr.fileListComplete && pr.checksComplete && pr.reviewsComplete,
        diagnostics: pr.fileListComplete ? [] : ['Pull request collection incomplete or bounded.'],
      }
    } catch {
      pullRequestFacts = undefined
      pullRequestSnapshot = undefined
    }
  }

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status"::text FROM "AnalysisRun" WHERE "id" = ${job.analysisRunId!} FOR UPDATE`
    if (!locked[0] || locked[0].status === 'CANCEL_REQUESTED') throw new AnalysisCancelledError()
    if (!await fenceJobLease(tx, job)) throw new LeaseLostError()
    const existing = await tx.scorecard.findMany({ where: { analysisRunId: job.analysisRunId! }, select: { id: true } })
    if (existing.length > 0) return
    const { contentHash: hashContent } = await import('@/lib/execution/hash')
    const evidence = collectRunEvidence({
      observedAt: new Date(),
      repositoryFullName: project.githubRepositoryFullName ?? undefined,
      commitSha,
      project: snapshot.project,
      sources: snapshot.sources.map((source) => ({
        id: source.id, type: source.type, title: source.title,
        contentHash: hashContent(source.content), byteCount: source.content.length, contentType: 'text',
      })),
      inputHash: run.inputHash,
      repositoryFacts,
      pullRequestFacts,
      repositoryFiles,
    })
    await persistEvidenceScorecards(tx, {
      projectId: job.projectId,
      analysisRunId: job.analysisRunId!,
      stageIds: {},
      evidence,
      evaluatedAt: new Date(),
    })
    if (pullRequestSnapshot && snapshot.project.githubRepositoryFullName) {
      await tx.pullRequestSnapshot.create({
        data: {
          projectId: job.projectId, analysisRunId: job.analysisRunId!,
          repositoryFullName: snapshot.project.githubRepositoryFullName,
          pullNumber: pullRequestSnapshot.pullNumber, headSha: pullRequestSnapshot.headSha,
          baseSha: pullRequestSnapshot.baseSha, mergedCommitSha: pullRequestSnapshot.mergedCommitSha,
          fileCount: pullRequestSnapshot.files.length, checkCount: pullRequestSnapshot.checks.length,
          reviewCount: pullRequestSnapshot.reviews.length, collectorVersion: 'github-pr-fixed-sha-v1',
          complete: pullRequestSnapshot.complete, diagnostics: pullRequestSnapshot.diagnostics as Prisma.InputJsonValue,
          observedAt: new Date(),
          files: { create: pullRequestSnapshot.files },
          checks: { create: pullRequestSnapshot.checks },
          reviews: { create: pullRequestSnapshot.reviews },
        },
      })
    }
    if (dependencyMap) {
      await tx.artifactVersion.create({
        data: {
          projectId: job.projectId, analysisRunId: job.analysisRunId!,
          kind: 'DEPENDENCY_MAP', schemaVersion: dependencyMap.schemaVersion,
          content: dependencyMap as unknown as Prisma.InputJsonValue,
          contentHash: contentHash(dependencyMap),
        },
      })
    }
    await tx.analysisRun.update({
      where: { id: job.analysisRunId! },
      data: { ledgerSealedAt: new Date(), commitSha: commitSha ?? undefined },
    })
    await tx.project.update({ where: { id: job.projectId, ownerId: job.ownerId }, data: { activeAnalysisRunId: job.analysisRunId, status: 'completed' } })
  })
  try {
    const { notifyRunCompleted } = await import('@/lib/notifications/center')
    await notifyRunCompleted({ userId: job.ownerId, projectId: job.projectId, runId: job.analysisRunId!, status: 'BASELINE_SEALED' })
  } catch {
    // Notifications are fail-open; baseline sealing must not depend on them.
  }
  return { commitSha }
}

import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AnalysisStageName, AnalysisStageStatus } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { getAgentRunner } from '@/lib/agents/ai-runner'
import { fetchRepoContext, fetchPRContext } from '@/lib/github'
import { collectRepositorySnapshot, persistRepositorySnapshot, repositoryContextFromSnapshot } from '@/lib/github/repository-snapshot'
import { collectPullRequestContext } from '@/lib/github/pull-request-snapshot'
import { redactStructuredValue } from '@/lib/security/secret-redaction'
import { contentHash, executionVersionHash, stageInputHash } from '@/lib/execution/hash'
import { AnalysisCancelledError, classifyFailure } from '@/lib/execution/worker-core'
import { decideStageResume, stageIdentityMatches } from '@/lib/execution/stage-resume'
import { canPublishLegacyProjection } from '@/lib/execution/publication-policy'
import { fenceJobLease, LeaseLostError, type ClaimedJob } from '@/lib/execution/job-repository'
import { resolveExecutionVersion, type StageExecutionIdentity } from '@/lib/execution/version-registry'
import { checkpointTokenTotals } from '@/lib/execution/token-accounting'
import { collectRunEvidence, pullRequestFactsFromContext, repositoryFactsFromContext } from '@/lib/evidence/collectors'
import { persistEvidenceScorecards } from '@/lib/evidence/persistence'
import { buildDependencyMap, type DependencyMap } from '@/lib/repository/dependency-map'
import type { EvaluatedScorecard } from '@/lib/evidence/types'
import { constrainWorkflowEvidenceReferences } from '@/lib/evidence/references'
import type {
  KnowledgeDistillerInput,
  KnowledgeDistillerOutput,
  RepoContextAgentInput,
  RepoContextAgentOutput,
  WorkflowPlannerInput,
  WorkflowPlannerOutput,
  ReleaseReadinessInput,
  ReleaseReadinessOutput,
  ProofOfWorkInput,
  ProofOfWorkOutput,
  PipelineResult,
} from '@/types'

const runSnapshotSchema = z.object({
  project: z.object({
    name: z.string(), goal: z.string(), repoUrl: z.string(), prUrl: z.string(),
    githubRepositoryFullName: z.string().nullable().optional(),
    githubRepositoryId: z.string().nullable().optional(),
    githubInstallationId: z.string().nullable().optional(),
    githubBindingStatus: z.string().optional(),
  }).strict(),
  sources: z.array(z.object({
    id: z.string(), type: z.string(), title: z.string(), content: z.string(),
  }).strict()),
}).strict()

type StageOutput = KnowledgeDistillerOutput | RepoContextAgentOutput | WorkflowPlannerOutput | ReleaseReadinessOutput | ProofOfWorkOutput | { skippedReason: string }
type StageExecutionMetadata = StageExecutionIdentity & { requestedProvider: string; requestedModel: string }

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

async function executionState(job: ClaimedJob): Promise<{ runStatus: string; leaseHeld: boolean }> {
  const [run, leases] = await Promise.all([
    prisma.analysisRun.findUnique({ where: { id: job.analysisRunId! }, select: { status: true } }),
    prisma.$queryRaw<Array<{ held: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "Job"
        WHERE "id" = ${job.id} AND "leaseToken" = ${job.leaseToken}
          AND "status" = 'RUNNING' AND "leaseExpiresAt" > NOW()
      ) AS "held"
    `,
  ])
  return { runStatus: run?.status ?? 'MISSING', leaseHeld: leases[0]?.held === true }
}

async function assertExecutionAllowed(job: ClaimedJob, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new LeaseLostError()
  const state = await executionState(job)
  if (!state.leaseHeld) throw new LeaseLostError()
  if (state.runStatus === 'CANCEL_REQUESTED' || state.runStatus === 'CANCELLED') {
    throw new AnalysisCancelledError()
  }
  if (!['QUEUED', 'RUNNING'].includes(state.runStatus)) {
    throw new Error(`Analysis run is not executable (${state.runStatus}).`)
  }
}

async function beginStage(
  job: ClaimedJob,
  stage: AnalysisStageName,
  expectedInputHash: string,
  metadata: StageExecutionMetadata,
): Promise<StageOutput | null> {
  await assertExecutionAllowed(job)
  const existing = await prisma.analysisStageRun.findUnique({
    where: { analysisRunId_stage: { analysisRunId: job.analysisRunId!, stage } },
    include: { artifacts: { where: { kind: stage }, orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!existing) throw new Error(`Missing stage row: ${stage}`)
  const artifact = existing.artifacts[0]
  const integrityMatches = Boolean(
    artifact
    && existing.inputHash === expectedInputHash
    && existing.outputHash === artifact.contentHash
    && artifact.contentHash === contentHash(artifact.content)
    && stageIdentityMatches(existing, metadata)
    && stageIdentityMatches(artifact, metadata),
  )
  const decision = decideStageResume(existing.status, integrityMatches)
  if (decision === 'invalid') throw new Error(`Completed stage ${stage} has no valid immutable artifact.`)
  if (decision === 'resume') return artifact!.content as StageOutput

  await prisma.$transaction(async (tx) => {
    if (!await fenceJobLease(tx, job)) throw new LeaseLostError()
    const run = await tx.analysisRun.findUnique({ where: { id: job.analysisRunId! }, select: { status: true } })
    if (!run || run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED') throw new AnalysisCancelledError()
    await tx.analysisStageRun.update({
      where: { id: existing.id },
      data: {
        status: 'RUNNING',
        attemptCount: { increment: 1 },
        startedAt: existing.startedAt ?? new Date(),
        completedAt: null,
        inputHash: expectedInputHash,
        failureClass: null,
        failureCode: null,
        failureMessage: null,
        promptId: metadata.promptId,
        promptVersion: metadata.promptVersion,
        agentSchemaVersion: metadata.schemaVersion,
        requestedProvider: metadata.requestedProvider,
        requestedModel: metadata.requestedModel,
      },
    })
    await tx.project.update({ where: { id: job.projectId }, data: { status: `analyzing:${stage.toLowerCase()}` } })
  })
  return null
}

async function checkpointStage(
  job: ClaimedJob,
  stage: AnalysisStageName,
  output: StageOutput,
  metadata: StageExecutionMetadata,
  status: AnalysisStageStatus = AnalysisStageStatus.SUCCEEDED,
): Promise<void> {
  const safeOutput = redactStructuredValue(output)
  const hash = contentHash(safeOutput)
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text FROM "AnalysisRun"
      WHERE "id" = ${job.analysisRunId!}
      FOR UPDATE
    `
    if (!locked[0] || locked[0].status === 'CANCEL_REQUESTED' || locked[0].status === 'CANCELLED') {
      throw new AnalysisCancelledError()
    }
    if (locked[0].status !== 'RUNNING') throw new Error('Run status rejected checkpoint publication.')
    if (!await fenceJobLease(tx, job)) throw new LeaseLostError()
    const stageRow = await tx.analysisStageRun.findUniqueOrThrow({
      where: { analysisRunId_stage: { analysisRunId: job.analysisRunId!, stage } },
    })
    await tx.artifactVersion.create({
      data: {
        projectId: job.projectId,
        analysisRunId: job.analysisRunId,
        analysisStageRunId: stageRow.id,
        kind: stage,
        content: asJson(safeOutput),
        contentHash: hash,
        promptId: metadata.promptId,
        promptVersion: metadata.promptVersion,
        agentSchemaVersion: metadata.schemaVersion,
        requestedProvider: metadata.requestedProvider,
        requestedModel: metadata.requestedModel,
      },
    })
    const operation = `analysis.${stage.toLowerCase()}:${job.analysisRunId}`
    const [usage, charged] = await Promise.all([
      tx.aiUsageEvent.aggregate({
        where: { projectId: job.projectId, operation },
        _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      }),
      tx.aiTokenReservation.aggregate({
        where: { projectId: job.projectId, operation, status: 'RECONCILED' },
        _sum: { actualTokens: true },
      }),
    ])
    const tokens = checkpointTokenTotals({
      telemetryInputTokens: usage._sum.inputTokens,
      telemetryOutputTokens: usage._sum.outputTokens,
      telemetryTotalTokens: usage._sum.totalTokens,
      reconciledTotalTokens: charged._sum.actualTokens,
    })
    await tx.analysisStageRun.update({
      where: { id: stageRow.id },
      data: {
        status,
        outputHash: hash,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        totalTokens: tokens.totalTokens,
        completedAt: new Date(),
      },
    })
  })
}

async function recordStageFailure(job: ClaimedJob, stage: AnalysisStageName, error: unknown): Promise<void> {
  const failure = classifyFailure(error)
  await prisma.$transaction(async (tx) => {
    if (!await fenceJobLease(tx, job)) return
    await tx.analysisStageRun.updateMany({
      where: { analysisRunId: job.analysisRunId!, stage, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        failureClass: failure.failureClass,
        failureCode: failure.code,
        failureMessage: failure.message.slice(0, 2_000),
        completedAt: new Date(),
      },
    })
  })
}

async function executeStage<T extends StageOutput>(input: {
  job: ClaimedJob
  stage: AnalysisStageName
  inputHash: string
  signal: AbortSignal
  metadata: StageExecutionMetadata
  run: () => Promise<T>
}): Promise<T> {
  const resumed = await beginStage(input.job, input.stage, input.inputHash, input.metadata)
  if (resumed) return resumed as T
  try {
    await assertExecutionAllowed(input.job, input.signal)
    const output = redactStructuredValue(await input.run())
    await assertExecutionAllowed(input.job, input.signal)
    await checkpointStage(input.job, input.stage, output, input.metadata)
    return output
  } catch (error) {
    const state = await executionState(input.job)
    if (state.runStatus === 'CANCEL_REQUESTED' || state.runStatus === 'CANCELLED') {
      throw new AnalysisCancelledError()
    }
    await recordStageFailure(input.job, input.stage, error)
    throw error
  }
}

async function skipStage(
  job: ClaimedJob,
  stage: AnalysisStageName,
  inputHash: string,
  reason: string,
  metadata: StageExecutionMetadata,
): Promise<void> {
  const resumed = await beginStage(job, stage, inputHash, metadata)
  if (!resumed) await checkpointStage(job, stage, { skippedReason: reason }, metadata, AnalysisStageStatus.SKIPPED)
}

async function publishSuccessfulRun(input: {
  job: ClaimedJob
  knowledge: KnowledgeDistillerOutput
  repo?: RepoContextAgentOutput
  workflow: WorkflowPlannerOutput
  release?: ReleaseReadinessOutput
  proof: ProofOfWorkOutput
  snapshot: z.infer<typeof runSnapshotSchema>
  observedAt: Date
  repositoryFullName?: string
  commitSha?: string
  dependencyMap?: DependencyMap
  repositorySourceFiles?: Array<{ path: string; contentHash: string }>
}): Promise<void> {
  const { job, knowledge, repo, workflow, release, proof, snapshot } = input
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text FROM "AnalysisRun"
      WHERE "id" = ${job.analysisRunId!}
      FOR UPDATE
    `
    if (!locked[0] || locked[0].status === 'CANCEL_REQUESTED') throw new AnalysisCancelledError()
    const stages = await tx.analysisStageRun.findMany({
      where: { analysisRunId: job.analysisRunId! },
      orderBy: { ordinal: 'asc' },
      select: { status: true },
    })
    if (!canPublishLegacyProjection(locked[0].status, stages.map((stage) => stage.status))) {
      throw new Error('Run is not fully checkpointed and publishable.')
    }
    if (!await fenceJobLease(tx, job)) throw new LeaseLostError()

    const stageRows = await tx.analysisStageRun.findMany({
      where: { analysisRunId: job.analysisRunId! },
      select: { id: true, stage: true },
    })
    const evidence = collectRunEvidence({
      observedAt: input.observedAt,
      repositoryFullName: input.repositoryFullName,
      commitSha: input.commitSha,
      project: snapshot.project,
      sources: snapshot.sources,
      repositoryFacts: repo?.collectorFacts,
      pullRequestFacts: release?.collectorFacts,
      proofArtifactHash: contentHash(proof),
      repositoryFiles: input.repositorySourceFiles,
    })
    const scorecards = await persistEvidenceScorecards(tx, {
      projectId: job.projectId,
      analysisRunId: job.analysisRunId!,
      stageIds: Object.fromEntries(stageRows.map((row) => [row.stage, row.id])),
      evidence,
      evaluatedAt: new Date(),
    })

    await tx.knowledgeSummary.upsert({
      where: { projectId: job.projectId },
      create: knowledgeProjection(job.projectId, knowledge),
      update: knowledgeProjection(job.projectId, knowledge),
    })
    if (repo) {
      await tx.repoAnalysis.upsert({
        where: { projectId: job.projectId },
        create: repoProjection(job.projectId, repo, snapshot.project.repoUrl, scorecards.REPOSITORY_MATURITY),
        update: repoProjection(job.projectId, repo, snapshot.project.repoUrl, scorecards.REPOSITORY_MATURITY),
      })
    } else {
      await tx.repoAnalysis.deleteMany({ where: { projectId: job.projectId } })
    }
    await tx.workflow.upsert({
      where: { projectId: job.projectId },
      create: workflowProjection(job.projectId, workflow),
      update: workflowProjection(job.projectId, workflow),
    })
    if (release) {
      await tx.releaseReport.upsert({
        where: { projectId: job.projectId },
        create: releaseProjection(job.projectId, release, scorecards.RELEASE_READINESS),
        update: releaseProjection(job.projectId, release, scorecards.RELEASE_READINESS),
      })
    } else {
      await tx.releaseReport.deleteMany({ where: { projectId: job.projectId } })
    }
    if (input.dependencyMap) {
      const repositoryStage = stageRows.find((row) => row.stage === AnalysisStageName.REPOSITORY)
      await tx.artifactVersion.create({
        data: {
          projectId: job.projectId, analysisRunId: job.analysisRunId!, analysisStageRunId: repositoryStage?.id,
          kind: 'DEPENDENCY_MAP', schemaVersion: input.dependencyMap.schemaVersion,
          content: input.dependencyMap as unknown as Prisma.InputJsonValue,
          contentHash: contentHash(input.dependencyMap),
        },
      })
    }
    await tx.proofPack.upsert({
      where: { projectId: job.projectId },
      create: proofProjection(job.projectId, proof, scorecards.PROOF_COMPLETENESS),
      update: proofProjection(job.projectId, proof, scorecards.PROOF_COMPLETENESS),
    })

    const usage = await tx.analysisStageRun.aggregate({
      where: { analysisRunId: job.analysisRunId! },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
    })
    await tx.analysisRun.update({
      where: { id: job.analysisRunId! },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(),
        ledgerSealedAt: new Date(),
        failureClass: null,
        failureCode: null,
        failureMessage: null,
        inputTokens: usage._sum.inputTokens ?? 0,
        outputTokens: usage._sum.outputTokens ?? 0,
        totalTokens: usage._sum.totalTokens ?? 0,
      },
    })
    await tx.project.update({
      where: { id: job.projectId, ownerId: job.ownerId },
      data: { activeAnalysisRunId: job.analysisRunId, status: 'completed' },
    })
    const completedJob = await tx.job.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, status: 'RUNNING' },
      data: {
        status: 'SUCCEEDED', completedAt: new Date(), leaseOwner: null,
        leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
      },
    })
    if (completedJob.count !== 1) throw new LeaseLostError()
  })
}

export async function executeAnalysisJob(job: ClaimedJob, leaseSignal: AbortSignal): Promise<PipelineResult> {
  if (!job.analysisRunId) throw new Error('Analysis job is missing analysisRunId.')
  const run = await prisma.analysisRun.findFirst({
    where: { id: job.analysisRunId, projectId: job.projectId, ownerId: job.ownerId },
  })
  if (!run) throw new Error('Persisted analysis job relationships are invalid.')
  const projectBinding = await prisma.project.findFirst({
    where: { id: job.projectId, ownerId: job.ownerId },
    select: { githubRepositoryFullName: true },
  })
  if (!projectBinding) throw new Error('Persisted analysis project relationship is invalid.')
  // Publication and job completion are separate fenced transitions. A crash between
  // them is recovered by treating an already-successful run as an idempotent success.
  if (run.status === 'SUCCEEDED') return { projectId: job.projectId }
  const snapshot = runSnapshotSchema.parse(run.inputSnapshot)
  if (contentHash(snapshot) !== run.inputHash) throw new Error('Analysis snapshot integrity validation failed.')
  const executionVersion = resolveExecutionVersion(run)

  await assertExecutionAllowed(job, leaseSignal)
  await prisma.$transaction(async (tx) => {
    if (!await fenceJobLease(tx, job)) throw new LeaseLostError()
    const started = await tx.analysisRun.updateMany({
      where: {
        id: run.id, projectId: job.projectId, ownerId: job.ownerId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date(), attemptCount: job.attemptCount },
    })
    if (started.count !== 1) {
      const current = await tx.analysisRun.findUnique({ where: { id: run.id }, select: { status: true } })
      if (current?.status === 'CANCEL_REQUESTED' || current?.status === 'CANCELLED') throw new AnalysisCancelledError()
      throw new LeaseLostError()
    }
  })

  const cancelController = new AbortController()
  const poll = setInterval(() => {
    void executionState(job).then((state) => {
      if (!state.leaseHeld || state.runStatus === 'CANCEL_REQUESTED' || state.runStatus === 'CANCELLED') {
        cancelController.abort(new AnalysisCancelledError())
      }
    }).catch(() => cancelController.abort(new LeaseLostError()))
  }, 1_000)
  poll.unref?.()
  const signal = AbortSignal.any([leaseSignal, cancelController.signal])
  const runner = getAgentRunner()
  const executionHash = executionVersionHash({
    pipelineVersion: run.pipelineVersion,
    promptVersion: run.promptVersion,
    modelConfigVersion: run.modelConfigVersion,
    modelConfig: run.modelConfig,
    stages: executionVersion.stages,
  })
  const stageHash = (stage: AnalysisStageName, dependencyOutputHashes?: Array<string | undefined>) =>
    stageInputHash({ runInputHash: run.inputHash, executionVersionHash: executionHash, stage, dependencyOutputHashes })
  const stageMetadata = (stage: AnalysisStageName): StageExecutionMetadata => ({
    ...executionVersion.stages[stage],
    requestedProvider: executionVersion.provider,
    requestedModel: executionVersion.model,
  })
  const context = (stage: AnalysisStageName) => ({
    userId: job.ownerId,
    projectId: job.projectId,
    operation: `analysis.${stage.toLowerCase()}:${job.analysisRunId}`,
    abortSignal: signal,
    provider: executionVersion.provider,
    model: executionVersion.model,
    pipelineVersion: run.pipelineVersion,
    ...executionVersion.stages[stage],
  })

  try {
    const knowledgeInputHash = stageHash(AnalysisStageName.KNOWLEDGE)
    const knowledge = await executeStage({
      job,
      stage: AnalysisStageName.KNOWLEDGE,
      inputHash: knowledgeInputHash,
      signal,
      metadata: stageMetadata(AnalysisStageName.KNOWLEDGE),
      run: async () => {
        const output = await runner.runKnowledgeDistiller({
          sources: snapshot.sources.map((source) => ({ type: source.type, title: source.title, content: source.content })),
        } satisfies KnowledgeDistillerInput, context(AnalysisStageName.KNOWLEDGE))
        return output
      },
    }) as KnowledgeDistillerOutput

    let repo: RepoContextAgentOutput | undefined
    const repoInputHash = stageHash(AnalysisStageName.REPOSITORY)
    if (!snapshot.project.repoUrl) {
      await skipStage(job, AnalysisStageName.REPOSITORY, repoInputHash, 'No repository URL in run snapshot.', stageMetadata(AnalysisStageName.REPOSITORY))
    } else {
      repo = await executeStage({
        job,
        stage: AnalysisStageName.REPOSITORY,
        inputHash: repoInputHash,
        signal,
        metadata: stageMetadata(AnalysisStageName.REPOSITORY),
        run: async () => {
          await assertExecutionAllowed(job, signal)
          let repoContext
          if (snapshot.project.githubBindingStatus === 'active' && snapshot.project.githubInstallationId && snapshot.project.githubRepositoryId) {
            const collected = await collectRepositorySnapshot({
              installationId: snapshot.project.githubInstallationId,
              repositoryId: snapshot.project.githubRepositoryId,
              expectedFullName: snapshot.project.githubRepositoryFullName ?? undefined,
              pinnedCommitSha: run.commitSha ?? undefined,
              signal,
            })
            await assertExecutionAllowed(job, signal)
            if (!run.commitSha) {
              await persistRepositorySnapshot({
                projectId: job.projectId,
                analysisRunId: job.analysisRunId!,
                installationId: snapshot.project.githubInstallationId,
                repositoryId: snapshot.project.githubRepositoryId,
                snapshot: collected,
              })
            }
            repoContext = repositoryContextFromSnapshot(collected)
          } else {
            repoContext = await fetchRepoContext(snapshot.project.repoUrl, { signal })
          }
          await assertExecutionAllowed(job, signal)
          const explanation = await runner.runRepoContextAgent({
            repoUrl: snapshot.project.repoUrl,
            readme: repoContext.readme,
            folderTree: repoContext.tree.join('\n'),
            packageJson: repoContext.packageJson,
            requirementsTxt: repoContext.requirementsTxt,
            pyprojectToml: repoContext.pyprojectToml,
            dockerfile: repoContext.dockerfile,
            dockerCompose: repoContext.dockerCompose,
            githubWorkflows: repoContext.githubWorkflows,
            envExample: repoContext.envExample,
          } satisfies RepoContextAgentInput, context(AnalysisStageName.REPOSITORY))
          return { ...explanation, collectorFacts: repositoryFactsFromContext(repoContext) }
        },
      }) as RepoContextAgentOutput
    }

    const workflowInputHash = stageHash(AnalysisStageName.WORKFLOW, [
      contentHash(knowledge), repo ? contentHash(repo) : undefined,
    ])
    const workflow = await executeStage({
      job,
      stage: AnalysisStageName.WORKFLOW,
      inputHash: workflowInputHash,
      signal,
      metadata: stageMetadata(AnalysisStageName.WORKFLOW),
      run: async () => {
        const evidenceIds = [
          ...snapshot.sources.map((source) => `source:${source.id}`),
          ...(repo ? ['repository:inventory'] : []),
        ]
        const drafted = await runner.runWorkflowPlanner({
          projectGoal: snapshot.project.goal || 'Build project based on learning sources',
          knowledgeSummary: knowledge,
          repoAnalysis: repo,
          evidenceIds,
        } satisfies WorkflowPlannerInput, context(AnalysisStageName.WORKFLOW))
        return constrainWorkflowEvidenceReferences(drafted, evidenceIds)
      },
    }) as WorkflowPlannerOutput

    let release: ReleaseReadinessOutput | undefined
    const releaseInputHash = stageHash(AnalysisStageName.RELEASE, [
      contentHash(workflow), repo ? contentHash(repo) : undefined,
    ])
    if (!snapshot.project.prUrl) {
      await skipStage(job, AnalysisStageName.RELEASE, releaseInputHash, 'No pull request URL in run snapshot.', stageMetadata(AnalysisStageName.RELEASE))
    } else {
      release = await executeStage({
        job,
        stage: AnalysisStageName.RELEASE,
        inputHash: releaseInputHash,
        signal,
        metadata: stageMetadata(AnalysisStageName.RELEASE),
        run: async () => {
          await assertExecutionAllowed(job, signal)
          const pr = snapshot.project.githubBindingStatus === 'active' && snapshot.project.githubInstallationId && snapshot.project.githubRepositoryId && snapshot.project.githubRepositoryFullName
            ? await collectPullRequestContext({
                url: snapshot.project.prUrl,
                installationId: snapshot.project.githubInstallationId,
                repositoryId: snapshot.project.githubRepositoryId,
                expectedFullName: snapshot.project.githubRepositoryFullName,
                signal,
              })
            : await fetchPRContext(snapshot.project.prUrl, { signal })
          await assertExecutionAllowed(job, signal)
          const explanation = await runner.runReleaseReadiness({
            prUrl: snapshot.project.prUrl,
            prDiff: pr.diff,
            changedFiles: pr.changedFiles,
            workflowAcceptanceCriteria: workflow.acceptanceCriteria,
            repoAnalysis: repo,
          } satisfies ReleaseReadinessInput, context(AnalysisStageName.RELEASE))
          return { ...explanation, collectorFacts: pullRequestFactsFromContext(pr) }
        },
      }) as ReleaseReadinessOutput
    }

    const proofInputHash = stageHash(AnalysisStageName.PROOF, [
      contentHash(knowledge), repo ? contentHash(repo) : undefined,
      contentHash(workflow), release ? contentHash(release) : undefined,
    ])
    const proof = await executeStage({
      job,
      stage: AnalysisStageName.PROOF,
      inputHash: proofInputHash,
      signal,
      metadata: stageMetadata(AnalysisStageName.PROOF),
      run: () => runner.runProofOfWork({
        projectGoal: snapshot.project.goal || 'Build project with AI-assisted development',
        workflowOutput: workflow,
        repoAnalysis: repo,
        releaseReport: release,
        finalSummary: `Completed analysis of ${snapshot.sources.length} sources${snapshot.project.repoUrl ? ` and repo ${snapshot.project.repoUrl}` : ''}`,
      } satisfies ProofOfWorkInput, context(AnalysisStageName.PROOF)),
    }) as ProofOfWorkOutput

    await assertExecutionAllowed(job, signal)
    const pinnedRun = await prisma.analysisRun.findUnique({ where: { id: job.analysisRunId! }, select: { commitSha: true } })
    const repositorySnapshot = await prisma.repositorySnapshot.findUnique({
      where: { analysisRunId: job.analysisRunId! },
      include: { files: { where: { status: 'collected', content: { not: null }, OR: ['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs'].map((extension) => ({ path: { endsWith: extension } })) }, select: { path: true, content: true, contentHash: true } } },
    })
    const dependencyMap = repositorySnapshot && repositorySnapshot.files.length
      ? buildDependencyMap({
          repositoryFullName: repositorySnapshot.repositoryFullName,
          commitSha: repositorySnapshot.commitSha,
          snapshotComplete: repositorySnapshot.complete,
          files: repositorySnapshot.files.map((file) => ({ path: file.path, content: file.content!, contentHash: file.contentHash! })),
        })
      : undefined
    await publishSuccessfulRun({
      job, knowledge, repo, workflow, release, proof, snapshot,
      observedAt: run.createdAt,
      repositoryFullName: projectBinding.githubRepositoryFullName ?? undefined,
      commitSha: pinnedRun?.commitSha ?? undefined,
      dependencyMap,
      repositorySourceFiles: repositorySnapshot?.files.map((file) => ({ path: file.path, contentHash: file.contentHash! })),
    })
    return { projectId: job.projectId, knowledge, repoAnalysis: repo, workflow, releaseReport: release, proofPack: proof }
  } finally {
    clearInterval(poll)
  }
}

function knowledgeProjection(projectId: string, output: KnowledgeDistillerOutput) {
  return { projectId, mainTopic: output.mainTopic, keyConcepts: JSON.stringify(output.keyConcepts), implementationPatterns: JSON.stringify(output.implementationPatterns), buildableTasks: JSON.stringify(output.buildableTasks), warningsOrPitfalls: JSON.stringify(output.warningsOrPitfalls), termsToUnderstand: JSON.stringify(output.termsToUnderstand), sourceEvidence: JSON.stringify(output.sourceEvidence), recommendedNextAction: output.recommendedNextAction, rawOutput: JSON.stringify(output) }
}
function scoreProjection(scorecard: EvaluatedScorecard) {
  return {
    scoreCompleteness: scorecard.completenessRatio,
    scoreStatus: scorecard.score === null ? 'unknown' : 'scored',
    scorecardVersion: scorecard.version,
  }
}
function repoProjection(projectId: string, output: RepoContextAgentOutput, repoUrl: string, scorecard: EvaluatedScorecard) {
  return { projectId, repoUrl, detectedStack: JSON.stringify(output.detectedStack), architectureSummary: output.architectureSummary, importantFiles: JSON.stringify(output.importantFiles), likelyFeatureLocations: JSON.stringify(output.likelyFeatureLocations), testLocations: JSON.stringify(output.testLocations), setupQuality: output.setupQuality, missingItems: JSON.stringify(output.missingItems), risks: JSON.stringify(output.risks), maturityScore: scorecard.score ?? 0, ...scoreProjection(scorecard), recommendedFixes: JSON.stringify(output.recommendedFixes), rawOutput: JSON.stringify(output) }
}
function workflowProjection(projectId: string, output: WorkflowPlannerOutput) {
  return { projectId, title: output.workflowTitle, objective: output.objective, tasksJson: JSON.stringify(output.tasks), acceptanceCriteria: JSON.stringify(output.acceptanceCriteria), testPlan: output.testPlan, expectedFiles: JSON.stringify(output.expectedFilesToChange), reviewChecklist: JSON.stringify(output.reviewChecklist), rawOutput: JSON.stringify(output) }
}
function releaseProjection(projectId: string, output: ReleaseReadinessOutput, scorecard: EvaluatedScorecard) {
  const decision = scorecard.score === null ? 'unknown' : scorecard.failCount > 0 ? 'go_with_fixes' : 'go'
  return { projectId, releaseScore: scorecard.score ?? 0, ...scoreProjection(scorecard), decision, topRisks: JSON.stringify(output.topRisks), missingTests: JSON.stringify(output.missingTests), missingDocs: JSON.stringify(output.missingDocs), configOrEnvIssues: JSON.stringify(output.configOrEnvIssues), backwardCompatibility: JSON.stringify(output.backwardCompatibilityConcerns), releaseChecklist: JSON.stringify(output.releaseChecklist), releaseNotesDraft: output.releaseNotesDraft, recommendedFixesBeforeMerge: JSON.stringify(output.recommendedFixesBeforeMerge), rawOutput: JSON.stringify(output) }
}
function proofProjection(projectId: string, output: ProofOfWorkOutput, scorecard: EvaluatedScorecard) {
  return { projectId, portfolioSummary: output.portfolioSummary, resumeBullet: output.resumeBullet, demoVideoScript: output.demoVideoScript, interviewExplanation: output.interviewExplanation, linkedinPost: output.linkedinPost, proofScore: scorecard.score ?? 0, ...scoreProjection(scorecard), missingProofItems: JSON.stringify(output.missingProofItems), rawOutput: JSON.stringify(output) }
}

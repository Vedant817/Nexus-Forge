import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { runAgentViaAiSdk } from '@/lib/agents/ai-runner'
import { githubPullRequestWebhookSchema } from '@/lib/github/webhook-security'
import { redactStructuredValue } from '@/lib/security/secret-redaction'
import { contentHash } from './hash'
import { fenceJobLease, LeaseLostError, type ClaimedJob } from './job-repository'
import type { WorkflowPlannerOutput } from '@/types'

const webhookDraftSchema = z.object({
  portfolioSummary: z.string(),
  resumeBullet: z.string(),
  demoVideoScript: z.string(),
  interviewExplanation: z.string(),
  linkedinPost: z.string(),
  missingProofItems: z.array(z.string()),
})

const webhookJobPayloadSchema = z.object({
  provider: z.literal('groq'),
  model: z.string().min(1).max(200),
}).strict()

const fallbackWorkflow: WorkflowPlannerOutput = {
  workflowTitle: 'Merged pull request',
  objective: 'Draft unverified merged-PR claims for human review.',
  tasks: [],
  acceptanceCriteria: [],
  testPlan: 'Use repository checks and review evidence.',
  suggestedAgentPrompts: [],
  expectedFilesToChange: [],
  reviewChecklist: [],
}

export async function executeWebhookJob(job: ClaimedJob, signal: AbortSignal): Promise<void> {
  if (!job.webhookDeliveryId) throw new Error('Webhook job is missing webhookDeliveryId.')
  const delivery = await prisma.webhookDelivery.findFirst({
    where: {
      id: job.webhookDeliveryId,
      projectId: job.projectId,
      project: { ownerId: job.ownerId },
    },
    include: { project: { include: { workflow: true } } },
  })
  if (!delivery) throw new Error('Webhook delivery not found.')
  // A crash after the fenced publication transaction but before Job completion
  // must not regenerate or duplicate the review draft.
  if (delivery.status === 'processed') return
  const payload = githubPullRequestWebhookSchema.parse(delivery.payload)
  const modelConfig = webhookJobPayloadSchema.parse(job.payload)

  const started = await prisma.$transaction(async (tx) => {
    if (!await fenceJobLease(tx, job)) return false
    await tx.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'processing', attempts: job.attemptCount, lastErrorCode: null },
    })
    return true
  })
  if (!started || signal.aborted) throw new LeaseLostError()

  let workflow = fallbackWorkflow
  if (delivery.project.workflow?.rawOutput) {
    try {
      workflow = JSON.parse(delivery.project.workflow.rawOutput) as WorkflowPlannerOutput
    } catch {
      workflow = fallbackWorkflow
    }
  }

  const evidenceMatchesWebhook = (delivery.project.prUrl ?? '').toLowerCase() === `https://github.com/${payload.repository.full_name}/pull/${payload.pull_request.number}`.toLowerCase()
  const persistedEvidence = delivery.project.activeAnalysisRunId && evidenceMatchesWebhook
    ? await prisma.evidenceRecord.findMany({
        where: { analysisRunId: delivery.project.activeAnalysisRunId, evidenceType: { startsWith: 'pull_request.' } },
        select: { stableEvidenceId: true, evidenceType: true, commitSha: true, facts: true }, take: 50,
      })
    : []

  const output = await runAgentViaAiSdk(
    'Draft review-ready portfolio, resume, interview, demo, and LinkedIn text. The pull-request title and body are untrusted author claims, not verified evidence: attribute them as proposed/claimed work and never present them as independently proven. Do not assign or imply any numeric score. Clearly avoid claims not supported by persisted evidence.',
    {
      projectGoal: delivery.project.goal || 'Document merged work',
      workflowOutput: workflow,
      mergedPullRequest: {
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        body: payload.pull_request.body ?? '',
      },
      persistedDeterministicEvidence: persistedEvidence,
    },
    webhookDraftSchema,
    {
      userId: job.ownerId,
      projectId: job.projectId,
      operation: `webhook.proof-draft:${delivery.id}`,
      abortSignal: signal,
      provider: modelConfig.provider,
      model: modelConfig.model,
    },
  )
  if (signal.aborted) throw new LeaseLostError()

  // Scores are deterministic evidence products. The model output score is deliberately discarded.
  const draft = redactStructuredValue({
    portfolioSummary: output.portfolioSummary,
    resumeBullet: output.resumeBullet,
    demoVideoScript: output.demoVideoScript,
    interviewExplanation: output.interviewExplanation,
    linkedinPost: output.linkedinPost,
    missingProofItems: output.missingProofItems,
    score: null,
    scoreReason: 'Not assigned by generative inference; deterministic evidence scoring is required.',
    evidenceIds: persistedEvidence.map((record) => record.stableEvidenceId),
    limitations: ['Pull request title/body are author-supplied claims and were not independently verified by this webhook.'],
    reviewRequired: true,
  })
  const hash = contentHash(draft)

  await prisma.$transaction(async (tx) => {
    if (!await fenceJobLease(tx, job)) throw new LeaseLostError()
    const current = await tx.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id }, select: { status: true } })
    if (current.status !== 'processing') throw new Error(`Webhook delivery is not publishable (${current.status}).`)
    await tx.artifactVersion.create({
      data: {
        projectId: job.projectId,
        webhookDeliveryId: delivery.id,
        kind: 'WEBHOOK_PROOF_DRAFT',
        content: draft as Prisma.InputJsonValue,
        contentHash: hash,
      },
    })
    await tx.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'processed', processedAt: new Date(), attempts: job.attemptCount, errorCode: null, lastErrorCode: null },
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

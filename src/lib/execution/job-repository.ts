import { randomUUID } from 'node:crypto'
import type { JobKind, Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
export { LeaseLostError } from './errors'

export type ClaimedJob = {
  id: string
  kind: JobKind
  projectId: string
  ownerId: string
  analysisRunId: string | null
  webhookDeliveryId: string | null
  payload: Prisma.JsonValue | null
  attemptCount: number
  maxAttempts: number
  leaseToken: string
}

export type JobOutcome = 'retry' | 'dead' | 'lost' | 'succeeded' | 'cancelled'

export interface JobLeaseRepository {
  claim(workerId: string, leaseMs: number): Promise<ClaimedJob | null>
  validate(job: ClaimedJob): Promise<boolean>
  heartbeat(job: ClaimedJob, leaseMs: number): Promise<boolean>
  complete(job: ClaimedJob): Promise<boolean>
  cancel(job: ClaimedJob): Promise<boolean>
  retryOrDead(
    job: ClaimedJob,
    failure: { failureClass: string; code: string; message: string; transient: boolean },
  ): Promise<JobOutcome>
}

export const CLAIM_JOB_SQL = `
WITH terminal_success AS (
  SELECT job."id"
  FROM "Job" AS job
  LEFT JOIN "AnalysisRun" AS run ON run."id" = job."analysisRunId"
  LEFT JOIN "WebhookDelivery" AS delivery ON delivery."id" = job."webhookDeliveryId"
  WHERE job."status" = 'RUNNING'
    AND job."leaseExpiresAt" < NOW()
    AND job."attemptCount" >= job."maxAttempts"
    AND (run."status" = 'SUCCEEDED' OR delivery."status" = 'processed')
), succeeded_jobs AS (
  UPDATE "Job" AS job
  SET "status" = 'SUCCEEDED', "completedAt" = NOW(),
      "leaseOwner" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
      "heartbeatAt" = NULL, "updatedAt" = NOW()
  FROM terminal_success
  WHERE job."id" = terminal_success."id"
  RETURNING job."id"
), cancel_candidates AS (
  SELECT job."id" AS "jobId", run."id" AS "runId", run."projectId"
  FROM "Job" AS job
  JOIN "AnalysisRun" AS run ON run."id" = job."analysisRunId"
  WHERE job."status" = 'RUNNING'
    AND job."leaseExpiresAt" < NOW()
    AND job."attemptCount" >= job."maxAttempts"
    AND run."status" = 'CANCEL_REQUESTED'
), cancelled_runs AS (
  UPDATE "AnalysisRun" AS run
  SET "status" = 'CANCELLED', "cancelledAt" = NOW(), "completedAt" = NOW(), "updatedAt" = NOW()
  FROM cancel_candidates
  WHERE run."id" = cancel_candidates."runId" AND run."status" = 'CANCEL_REQUESTED'
  RETURNING run."id", run."projectId"
), cancelled_stages AS (
  UPDATE "AnalysisStageRun" AS stage
  SET "status" = 'CANCELLED', "completedAt" = NOW(), "updatedAt" = NOW()
  FROM cancelled_runs
  WHERE stage."analysisRunId" = cancelled_runs."id"
    AND stage."status" IN ('PENDING', 'RUNNING', 'FAILED')
  RETURNING stage."id"
), cancelled_jobs AS (
  UPDATE "Job" AS job
  SET "status" = 'CANCELLED', "completedAt" = NOW(),
      "leaseOwner" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
      "heartbeatAt" = NULL, "updatedAt" = NOW()
  FROM cancel_candidates
  WHERE job."id" = cancel_candidates."jobId"
  RETURNING job."id"
), cancelled_projects AS (
  UPDATE "Project" AS project
  SET "status" = 'cancelled', "updatedAt" = NOW()
  FROM cancelled_runs
  WHERE project."id" = cancelled_runs."projectId"
  RETURNING project."id"
), exhausted AS (
  UPDATE "Job" AS job
  SET "status" = 'DEAD', "completedAt" = NOW(),
      "failureClass" = 'TRANSIENT', "failureCode" = 'LeaseExpiredAfterMaxAttempts',
      "failureMessage" = 'Analysis stopped after repeated temporary worker failures.',
      "leaseOwner" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
      "heartbeatAt" = NULL, "updatedAt" = NOW()
  WHERE job."status" = 'RUNNING'
    AND job."leaseExpiresAt" < NOW()
    AND job."attemptCount" >= job."maxAttempts"
    AND NOT EXISTS (SELECT 1 FROM terminal_success WHERE terminal_success."id" = job."id")
    AND NOT EXISTS (SELECT 1 FROM cancel_candidates WHERE cancel_candidates."jobId" = job."id")
  RETURNING job."analysisRunId", job."projectId", job."webhookDeliveryId", job."attemptCount", job."kind"
), failed_runs AS (
  UPDATE "AnalysisRun" AS run
  SET "status" = 'FAILED', "completedAt" = NOW(),
      "failureClass" = 'TRANSIENT', "failureCode" = 'LeaseExpiredAfterMaxAttempts',
      "failureMessage" = 'Analysis stopped after repeated temporary worker failures.', "updatedAt" = NOW()
  FROM exhausted
  WHERE run."id" = exhausted."analysisRunId" AND run."status" IN ('QUEUED', 'RUNNING')
  RETURNING run."id", run."projectId"
), failed_running_stages AS (
  UPDATE "AnalysisStageRun" AS stage
  SET "status" = 'FAILED', "completedAt" = NOW(),
      "failureClass" = 'TRANSIENT', "failureCode" = 'LeaseExpiredAfterMaxAttempts',
      "failureMessage" = 'Analysis stopped after repeated temporary worker failures.', "updatedAt" = NOW()
  FROM failed_runs
  WHERE stage."analysisRunId" = failed_runs."id" AND stage."status" = 'RUNNING'
  RETURNING stage."id"
), cancelled_pending_stages AS (
  UPDATE "AnalysisStageRun" AS stage
  SET "status" = 'CANCELLED', "completedAt" = NOW(), "updatedAt" = NOW()
  FROM failed_runs
  WHERE stage."analysisRunId" = failed_runs."id" AND stage."status" = 'PENDING'
  RETURNING stage."id"
), failed_projects AS (
  UPDATE "Project" AS project
  SET "status" = 'error', "updatedAt" = NOW()
  FROM failed_runs
  WHERE project."id" = failed_runs."projectId"
  RETURNING project."id"
), failed_deliveries AS (
  UPDATE "WebhookDelivery" AS delivery
  SET "status" = 'failed', "attempts" = exhausted."attemptCount",
      "errorCode" = 'LeaseExpiredAfterMaxAttempts',
      "lastErrorCode" = 'LeaseExpiredAfterMaxAttempts', "lastErrorAt" = NOW(), "processedAt" = NOW()
  FROM exhausted
  WHERE delivery."id" = exhausted."webhookDeliveryId" AND delivery."status" <> 'processed'
  RETURNING delivery."id"
), candidate AS (
  SELECT "id"
  FROM "Job"
  WHERE (("status" IN ('QUEUED', 'RETRY_WAIT') AND "availableAt" <= NOW())
      OR ("status" = 'RUNNING' AND "leaseExpiresAt" < NOW()))
    AND "attemptCount" < "maxAttempts"
  ORDER BY "availableAt" ASC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE "Job" AS job
SET "status" = 'RUNNING', "leaseOwner" = $1, "leaseToken" = $2,
    "leaseExpiresAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
    "heartbeatAt" = NOW(), "startedAt" = COALESCE(job."startedAt", NOW()),
    "attemptCount" = job."attemptCount" + 1, "updatedAt" = NOW()
FROM candidate
WHERE job."id" = candidate."id"
RETURNING job."id", job."kind", job."projectId", job."ownerId",
          job."analysisRunId", job."webhookDeliveryId", job."payload",
          job."attemptCount", job."maxAttempts", job."leaseToken"
`

export const FENCE_JOB_SQL = `
UPDATE "Job"
SET "heartbeatAt" = NOW(), "updatedAt" = NOW()
WHERE "id" = $1 AND "leaseToken" = $2 AND "status" = 'RUNNING'
  AND "leaseExpiresAt" > NOW()
RETURNING "id"
`

export const HEARTBEAT_JOB_SQL = `
UPDATE "Job"
SET "heartbeatAt" = NOW(),
    "leaseExpiresAt" = NOW() + ($1 * INTERVAL '1 millisecond'),
    "updatedAt" = NOW()
WHERE "id" = $2 AND "leaseToken" = $3 AND "status" = 'RUNNING'
  AND "leaseExpiresAt" > NOW()
RETURNING "id"
`

export async function fenceJobLease(tx: Prisma.TransactionClient, job: ClaimedJob): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(FENCE_JOB_SQL, job.id, job.leaseToken)
  return rows.length === 1
}

async function cancelFencedJob(tx: Prisma.TransactionClient, job: ClaimedJob): Promise<boolean> {
  if (!await fenceJobLease(tx, job)) return false
  const result = await tx.job.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, status: 'RUNNING' },
    data: {
      status: 'CANCELLED', completedAt: new Date(), leaseOwner: null,
      leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
    },
  })
  if (result.count !== 1) return false
  if (job.analysisRunId) {
    const run = await tx.analysisRun.updateMany({
      where: { id: job.analysisRunId, projectId: job.projectId, ownerId: job.ownerId, status: 'CANCEL_REQUESTED' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), completedAt: new Date() },
    })
    if (run.count === 1) {
      await tx.analysisStageRun.updateMany({
        where: { analysisRunId: job.analysisRunId, status: { in: ['PENDING', 'RUNNING', 'FAILED'] } },
        data: { status: 'CANCELLED', completedAt: new Date() },
      })
      await tx.project.updateMany({
        where: { id: job.projectId, ownerId: job.ownerId },
        data: { status: 'cancelled' },
      })
    }
  }
  return true
}

export class PrismaJobLeaseRepository implements JobLeaseRepository {
  async claim(workerId: string, leaseMs: number): Promise<ClaimedJob | null> {
    const rows = await prisma.$queryRawUnsafe<ClaimedJob[]>(CLAIM_JOB_SQL, workerId, randomUUID(), leaseMs)
    return rows[0] ?? null
  }

  async validate(job: ClaimedJob): Promise<boolean> {
    if (job.kind === 'ANALYSIS' && job.analysisRunId && !job.webhookDeliveryId) {
      return Boolean(await prisma.job.findFirst({
        where: {
          id: job.id, kind: 'ANALYSIS', projectId: job.projectId, ownerId: job.ownerId,
          analysisRunId: job.analysisRunId, webhookDeliveryId: null,
          analysisRun: { projectId: job.projectId, ownerId: job.ownerId },
          project: { ownerId: job.ownerId },
        },
        select: { id: true },
      }))
    }
    if (job.kind === 'WEBHOOK' && job.webhookDeliveryId && !job.analysisRunId) {
      return Boolean(await prisma.job.findFirst({
        where: {
          id: job.id, kind: 'WEBHOOK', projectId: job.projectId, ownerId: job.ownerId,
          analysisRunId: null, webhookDeliveryId: job.webhookDeliveryId,
          webhookDelivery: { projectId: job.projectId, project: { ownerId: job.ownerId } },
          project: { ownerId: job.ownerId },
        },
        select: { id: true },
      }))
    }
    return false
  }

  async heartbeat(job: ClaimedJob, leaseMs: number): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      HEARTBEAT_JOB_SQL, leaseMs, job.id, job.leaseToken,
    )
    return rows.length === 1
  }

  async complete(job: ClaimedJob): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
      UPDATE "Job"
      SET "status" = 'SUCCEEDED', "completedAt" = NOW(),
          "leaseOwner" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL,
          "heartbeatAt" = NULL, "updatedAt" = NOW()
      WHERE "id" = $1 AND "leaseToken" = $2 AND "status" = 'RUNNING'
        AND "leaseExpiresAt" > NOW()
      RETURNING "id"
    `, job.id, job.leaseToken)
    if (rows.length === 1) return true
    return Boolean(await prisma.job.findFirst({ where: { id: job.id, status: 'SUCCEEDED' }, select: { id: true } }))
  }

  async cancel(job: ClaimedJob): Promise<boolean> {
    return prisma.$transaction((tx) => cancelFencedJob(tx, job))
  }

  async retryOrDead(
    job: ClaimedJob,
    failure: { failureClass: string; code: string; message: string; transient: boolean },
  ): Promise<JobOutcome> {
    const retry = failure.transient && job.attemptCount < job.maxAttempts
    const delayMs = Math.min(15 * 60_000, 1_000 * 2 ** Math.max(0, job.attemptCount - 1))
    return prisma.$transaction(async (tx) => {
      if (!await fenceJobLease(tx, job)) return 'lost'
      const held = await tx.job.findFirst({
        where: { id: job.id, leaseToken: job.leaseToken, status: 'RUNNING' },
        select: {
          id: true,
          analysisRun: { select: { status: true } },
          webhookDelivery: { select: { status: true } },
        },
      })
      if (!held) return 'lost'

      if (held.analysisRun?.status === 'SUCCEEDED' || held.webhookDelivery?.status === 'processed') {
        const completed = await tx.job.updateMany({
          where: { id: job.id, leaseToken: job.leaseToken, status: 'RUNNING' },
          data: {
            status: 'SUCCEEDED', completedAt: new Date(), leaseOwner: null,
            leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
          },
        })
        return completed.count === 1 ? 'succeeded' : 'lost'
      }
      if (held.analysisRun?.status === 'CANCEL_REQUESTED') {
        return (await cancelFencedJob(tx, job)) ? 'cancelled' : 'lost'
      }

      const transitioned = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "Job"
        SET "status" = CAST(${retry ? 'RETRY_WAIT' : 'DEAD'} AS "JobStatus"),
            "availableAt" = CASE WHEN ${retry} THEN NOW() + (${delayMs} * INTERVAL '1 millisecond') ELSE "availableAt" END,
            "completedAt" = CASE WHEN ${retry} THEN NULL ELSE NOW() END,
            "leaseOwner" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL, "heartbeatAt" = NULL,
            "failureClass" = ${failure.failureClass}, "failureCode" = ${failure.code},
            "failureMessage" = ${failure.message.slice(0, 2_000)}, "updatedAt" = NOW()
        WHERE "id" = ${job.id} AND "leaseToken" = ${job.leaseToken} AND "status" = 'RUNNING'
        RETURNING "id"
      `
      if (transitioned.length !== 1) return 'lost'
      if (job.analysisRunId) {
        const runUpdate = await tx.analysisRun.updateMany({
          where: {
            id: job.analysisRunId, projectId: job.projectId, ownerId: job.ownerId,
            status: { in: ['QUEUED', 'RUNNING'] },
          },
          data: {
            status: retry ? 'QUEUED' : 'FAILED', attemptCount: job.attemptCount,
            failureClass: failure.failureClass, failureCode: failure.code,
            failureMessage: failure.message.slice(0, 2_000), completedAt: retry ? null : new Date(),
          },
        })
        if (runUpdate.count === 1) {
          await tx.project.updateMany({
            where: { id: job.projectId, ownerId: job.ownerId },
            data: { status: retry ? 'queued:retry' : 'error' },
          })
        }
      }
      if (job.webhookDeliveryId) {
        await tx.webhookDelivery.updateMany({
          where: { id: job.webhookDeliveryId, projectId: job.projectId, status: { not: 'processed' } },
          data: {
            status: retry ? 'retry_wait' : 'failed', attempts: job.attemptCount,
            errorCode: failure.code, lastErrorCode: failure.code, lastErrorAt: new Date(),
            processedAt: retry ? null : new Date(),
          },
        })
      }
      return retry ? 'retry' : 'dead'
    })
  }
}

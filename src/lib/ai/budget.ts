import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { AiBudgetExceededError } from './budget-errors'

export { AiBudgetExceededError } from './budget-errors'

export type AiTelemetryContext = {
  userId: string
  projectId?: string
  operation: string
  requestedProvider: string
  requestedModel: string
  pipelineVersion?: string
  promptId?: string
  promptVersion?: string
  schemaVersion?: string
  keySource?: 'user' | 'platform'
  keyFingerprint?: string
}

export type AiBudgetReservation = AiTelemetryContext & {
  id: string
  keys: string[]
  periodStart: Date
  reservedTokens: number
  maxOutputTokens: number
}

export type AiTelemetryResult = {
  success: boolean
  errorCode?: string
  latencyMs: number
  responseProvider?: string
  responseModel?: string
  finishReason?: string
  responseId?: string
  attemptCount?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

type BudgetRow = { usedTokens: number; reservedTokens: number }

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
  return value
}

async function reserveBucket(
  tx: Prisma.TransactionClient,
  key: string,
  periodStart: Date,
  reservedTokens: number,
): Promise<BudgetRow> {
  const rows = await tx.$queryRaw<BudgetRow[]>`
    INSERT INTO "AiBudgetBucket" ("key", "periodStart", "usedTokens", "reservedTokens", "updatedAt")
    VALUES (${key}, ${periodStart}, 0, ${reservedTokens}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "periodStart" = CASE WHEN "AiBudgetBucket"."periodStart" < ${periodStart} THEN ${periodStart} ELSE "AiBudgetBucket"."periodStart" END,
      "usedTokens" = CASE WHEN "AiBudgetBucket"."periodStart" < ${periodStart} THEN 0 ELSE "AiBudgetBucket"."usedTokens" END,
      "reservedTokens" = CASE
        WHEN "AiBudgetBucket"."periodStart" < ${periodStart} THEN ${reservedTokens}
        ELSE "AiBudgetBucket"."reservedTokens" + ${reservedTokens}
      END,
      "updatedAt" = NOW()
    RETURNING "usedTokens", "reservedTokens"
  `
  return rows[0]
}

export function getAiMaxOutputTokens(): number {
  return readPositiveInt('AI_MAX_TOKENS_PER_CALL', 20_000)
}

export async function reserveAiBudget(
  input: AiTelemetryContext & { reservedTokens?: number },
): Promise<AiBudgetReservation> {
  const reservedTokens = input.reservedTokens ?? getAiMaxOutputTokens()
  const userLimit = readPositiveInt('AI_DAILY_USER_TOKEN_BUDGET', 250_000)
  const projectLimit = readPositiveInt('AI_DAILY_PROJECT_TOKEN_BUDGET', 150_000)
  const periodStart = startOfUtcDay(new Date())
  const keys = [`user:${input.userId}:${periodStart.toISOString()}`]
  if (input.projectId) keys.push(`project:${input.projectId}:${periodStart.toISOString()}`)

  return prisma.$transaction(async (tx) => {
    const user = await reserveBucket(tx, keys[0], periodStart, reservedTokens)
    if (user.usedTokens + user.reservedTokens > userLimit) throw new AiBudgetExceededError('user')
    if (input.projectId) {
      const project = await reserveBucket(tx, keys[1], periodStart, reservedTokens)
      if (project.usedTokens + project.reservedTokens > projectLimit) throw new AiBudgetExceededError('project')
    }
    return tx.aiTokenReservation.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        userBucketKey: keys[0],
        projectBucketKey: keys[1],
        operation: input.operation,
        reservedTokens,
      },
      select: { id: true },
    })
  }).then(({ id }) => {
    const { reservedTokens: _ignored, ...context } = input
    void _ignored
    return { ...context, id, keys, periodStart, reservedTokens, maxOutputTokens: reservedTokens }
  })
}

/** Budget accounting is fail-closed and committed before a successful result is returned. */
export async function reconcileAiBudget(
  reservation: AiBudgetReservation,
  usage: { totalTokens?: number },
): Promise<number> {
  // Missing usage is charged conservatively at the full reservation. Provider-reported
  // overages are charged in full so subsequent reservations cannot silently exceed caps.
  const actualTokens = usage.totalTokens == null
    ? reservation.reservedTokens
    : Math.max(0, usage.totalTokens)
  return prisma.$transaction(async (tx) => {
    const settled = await tx.aiTokenReservation.updateMany({
      where: { id: reservation.id, status: 'RESERVED' },
      data: { status: 'RECONCILED', actualTokens, settledAt: new Date() },
    })
    if (settled.count === 0) {
      const existing = await tx.aiTokenReservation.findUnique({
        where: { id: reservation.id },
        select: { actualTokens: true },
      })
      return existing?.actualTokens ?? actualTokens
    }
    for (const key of reservation.keys) {
      await tx.$executeRaw`
        UPDATE "AiBudgetBucket"
        SET "reservedTokens" = GREATEST(0, "reservedTokens" - ${reservation.reservedTokens}),
            "usedTokens" = "usedTokens" + ${actualTokens},
            "updatedAt" = NOW()
        WHERE "key" = ${key}
      `
    }
    return actualTokens
  })
}

export async function releaseAiBudget(reservation: AiBudgetReservation): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const settled = await tx.aiTokenReservation.updateMany({
      where: { id: reservation.id, status: 'RESERVED' },
      data: { status: 'RELEASED', settledAt: new Date() },
    })
    if (settled.count === 0) return
    for (const key of reservation.keys) {
      await tx.$executeRaw`
        UPDATE "AiBudgetBucket"
        SET "reservedTokens" = GREATEST(0, "reservedTokens" - ${reservation.reservedTokens}),
            "updatedAt" = NOW()
        WHERE "key" = ${key}
      `
    }
  })
}

/** Telemetry is intentionally fail-open and stores no prompts, outputs, headers, or provider bodies. */
export async function recordAiUsageEvent(
  context: AiTelemetryContext,
  result: AiTelemetryResult,
  reservationId?: string,
): Promise<void> {
  await prisma.aiUsageEvent.create({
    data: {
      userId: context.userId,
      projectId: context.projectId,
      operation: context.operation,
      provider: context.requestedProvider,
      requestedProvider: context.requestedProvider,
      requestedModel: context.requestedModel,
      responseProvider: result.responseProvider,
      responseModel: result.responseModel,
      success: result.success,
      errorCode: result.errorCode,
      latencyMs: Math.max(0, Math.round(result.latencyMs)),
      pipelineVersion: context.pipelineVersion,
      promptId: context.promptId,
      promptVersion: context.promptVersion,
      schemaVersion: context.schemaVersion,
      finishReason: result.finishReason,
      responseId: result.responseId,
      attemptCount: result.attemptCount,
      keySource: context.keySource,
      keyFingerprint: context.keyFingerprint,
      reservationId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
    },
  })
}

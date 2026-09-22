import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import config from '@/lib/config/env'
import { redactStructuredValue } from '@/lib/security/secret-redaction'
import { invalidateInstallationTokens } from '@/lib/github/app-auth'
import {
  githubInstallationRepositoriesWebhookSchema,
  githubInstallationWebhookSchema,
  githubPullRequestWebhookSchema,
  readBoundedWebhookBody,
  verifyGitHubWebhookSignature,
  WebhookBodyTooLargeError,
} from '@/lib/github/webhook-security'

const DEFAULT_MAX_BODY_BYTES = 1_000_000
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9-]{1,100}$/

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook receiver is not configured' }, { status: 503 })
  }

  const signature = request.headers.get('x-hub-signature-256')
  const event = request.headers.get('x-github-event')
  const deliveryId = request.headers.get('x-github-delivery')
  if (!signature || !deliveryId || !DELIVERY_ID_PATTERN.test(deliveryId)) {
    return NextResponse.json({ error: 'Missing or invalid GitHub webhook headers' }, { status: 401 })
  }
  if (!['pull_request', 'installation', 'installation_repositories'].includes(event ?? '')) {
    return NextResponse.json({ error: 'Unsupported GitHub event' }, { status: 400 })
  }

  const maxBodyBytes = Number(process.env.WEBHOOK_MAX_BODY_BYTES ?? DEFAULT_MAX_BODY_BYTES)
  let rawBody: Buffer
  try {
    rawBody = await readBoundedWebhookBody(request, maxBodyBytes)
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 })
    }
    return NextResponse.json({ error: 'Webhook receiver configuration is invalid' }, { status: 503 })
  }

  if (!verifyGitHubWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const payloadSha256 = createHash('sha256').update(rawBody).digest('hex')
  if (event === 'installation' || event === 'installation_repositories') {
    const lifecycle = event === 'installation'
      ? githubInstallationWebhookSchema.safeParse(json)
      : githubInstallationRepositoriesWebhookSchema.safeParse(json)
    if (!lifecycle.success) return NextResponse.json({ error: 'Invalid GitHub lifecycle payload' }, { status: 400 })
    const installationId = String(lifecycle.data.installation.id)
    const observedAt = new Date()
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${installationId}, 0))`
        const safeLifecyclePayload = JSON.parse(JSON.stringify(redactStructuredValue(lifecycle.data)))
        await tx.gitHubLifecycleDelivery.create({
          data: { deliveryId, event, action: lifecycle.data.action, installationId, payloadSha256, payload: safeLifecyclePayload },
        })
        await tx.gitHubInstallationLifecycle.upsert({
          where: { installationId },
          create: { installationId, status: lifecycle.data.action, deliveryId, observedAt },
          update: { status: lifecycle.data.action, deliveryId, observedAt, revision: { increment: 1 } },
        })
        if (event === 'installation' && ['deleted', 'suspend'].includes(lifecycle.data.action)) {
          await tx.project.updateMany({ where: { githubInstallationId: installationId }, data: { githubBindingStatus: lifecycle.data.action, githubBindingDisabledAt: new Date() } })
        } else if (event === 'installation') {
          await tx.project.updateMany({ where: { githubInstallationId: installationId }, data: { githubBindingStatus: 'reconciliation_required', githubBindingDisabledAt: new Date() } })
        } else if (event === 'installation_repositories' && lifecycle.data.action === 'removed') {
          const removedIds = lifecycle.data.repositories_removed.map((repository) => String(repository.id))
          if (removedIds.length) {
            await tx.project.updateMany({ where: { githubInstallationId: installationId, githubRepositoryId: { in: removedIds } }, data: { githubBindingStatus: 'removed', githubBindingDisabledAt: new Date() } })
          } else {
            await tx.project.updateMany({ where: { githubInstallationId: installationId }, data: { githubBindingStatus: 'reconciliation_required', githubBindingDisabledAt: new Date() } })
          }
        } else if (event === 'installation_repositories') {
          await tx.project.updateMany({ where: { githubInstallationId: installationId }, data: { githubBindingStatus: 'reconciliation_required', githubBindingDisabledAt: new Date() } })
        }
      })
      invalidateInstallationTokens(installationId)
      return NextResponse.json({ accepted: true }, { status: 202 })
    } catch (error) {
      if (isUniqueConstraintError(error)) return NextResponse.json({ accepted: true, replay: true }, { status: 202 })
      throw error
    }
  }

  const parsed = githubPullRequestWebhookSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid pull request payload' }, { status: 400 })
  const payload = parsed.data
  const installationId = String(payload.installation.id)
  const repositoryId = String(payload.repository.id)
  const project = await prisma.project.findFirst({
    where: { githubInstallationId: installationId, githubRepositoryId: repositoryId, githubBindingStatus: 'active' },
    select: { id: true, ownerId: true },
  })
  if (!project?.ownerId) {
    return NextResponse.json({ error: 'Repository installation is not registered' }, { status: 404 })
  }

  const ownerId = project.ownerId
  const shouldProcess = payload.action === 'closed' && payload.pull_request.merged
  const eventKey = `${repositoryId}:${payload.pull_request.id}:${payload.action}:${payload.pull_request.merged}`

  try {
    await prisma.$transaction(async (tx) => {
      const delivery = await tx.webhookDelivery.create({
        data: {
          deliveryId,
          eventKey,
          payloadSha256,
          payload: redactStructuredValue(payload),
          projectId: project.id,
          event: 'pull_request',
          action: payload.action,
          status: shouldProcess ? 'received' : 'ignored',
          processedAt: shouldProcess ? null : new Date(),
        },
      })
      if (shouldProcess) {
        await tx.job.create({
          data: {
            kind: 'WEBHOOK',
            projectId: project.id,
            ownerId,
            webhookDeliveryId: delivery.id,
            payload: { provider: 'groq', model: config.GROQ_MODEL },
          },
        })
      }
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ accepted: true, replay: true }, { status: 202 })
    }
    throw error
  }

  // The durable execution worker consumes received deliveries.
  return NextResponse.json({ accepted: true, queued: shouldProcess }, { status: 202 })
}

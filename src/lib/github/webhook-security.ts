import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export class WebhookBodyTooLargeError extends Error {
  constructor() {
    super('Webhook body too large')
    this.name = 'WebhookBodyTooLargeError'
  }
}

export const githubPullRequestWebhookSchema = z.object({
  action: z.string().max(50),
  installation: z.object({ id: z.number().int().positive().safe() }),
  repository: z.object({
    id: z.number().int().positive().safe(),
    full_name: z.string().min(3).max(300),
  }),
  pull_request: z.object({
    id: z.number().int().positive().safe(),
    number: z.number().int().positive().safe(),
    title: z.string().max(1000),
    body: z.string().max(100_000).nullable(),
    merged: z.boolean(),
  }),
})

export const githubInstallationWebhookSchema = z.object({
  action: z.enum(['created', 'deleted', 'suspend', 'unsuspend', 'new_permissions_accepted']),
  installation: z.object({ id: z.number().int().positive().safe() }),
}).passthrough()

export const githubInstallationRepositoriesWebhookSchema = z.object({
  action: z.enum(['added', 'removed']),
  installation: z.object({ id: z.number().int().positive().safe() }),
  repositories_added: z.array(z.object({ id: z.number().int().positive().safe(), full_name: z.string().max(300) })).default([]),
  repositories_removed: z.array(z.object({ id: z.number().int().positive().safe(), full_name: z.string().max(300) })).default([]),
}).passthrough()

export type GitHubPullRequestWebhook = z.infer<typeof githubPullRequestWebhookSchema>

export async function readBoundedWebhookBody(request: Request, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('WEBHOOK_MAX_BODY_BYTES must be a positive safe integer.')
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new WebhookBodyTooLargeError()
  }

  if (!request.body) return Buffer.alloc(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel('Webhook body exceeded configured limit')
        throw new WebhookBodyTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length)
}

export function verifyGitHubWebhookSignature(
  rawBody: string | Uint8Array,
  signature: string,
  secret: string,
): boolean {
  if (!signature.startsWith('sha256=')) return false

  const suppliedHex = signature.slice('sha256='.length)
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const supplied = Buffer.from(suppliedHex, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

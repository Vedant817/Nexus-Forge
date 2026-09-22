import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  createDelivery: vi.fn(),
  createJob: vi.fn(),
  createLifecycleDelivery: vi.fn(),
  upsertLifecycle: vi.fn(),
  updateProjects: vi.fn(),
  advisoryLock: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    project: { findFirst: mocks.findProject },
    $transaction: mocks.transaction,
  },
}))

import { POST } from '@/app/api/webhooks/github/route'
import { verifyGitHubWebhookSignature } from '@/lib/github/webhook-security'

const payload = {
  action: 'closed',
  installation: { id: 42 },
  repository: { id: 7, full_name: 'Owner/Repo' },
  pull_request: {
    id: 10,
    number: 5,
    title: 'Ship Unicode ✓',
    body: 'Résumé body',
    merged: true,
  },
}

function signedRequest(body: string, headers: Record<string, string> = {}): Request {
  const signature = `sha256=${createHmac('sha256', 'test-webhook-secret').update(body, 'utf8').digest('hex')}`
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': 'delivery-1',
      'x-hub-signature-256': signature,
      ...headers,
    },
  })
}

describe('GitHub webhook signature verification', () => {
  it('matches GitHub\'s published SHA-256 test vector', () => {
    expect(
      verifyGitHubWebhookSignature(
        'Hello, World!',
        'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
        "It's a Secret to Everybody",
      ),
    ).toBe(true)
  })
})

describe('GitHub webhook receiver', () => {
  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret'
    process.env.WEBHOOK_MAX_BODY_BYTES = '1000000'
    mocks.findProject.mockResolvedValue({ id: 'project-1', ownerId: 'user-1', externalInferenceEnabled: true, inferenceSuspendedAt: null, ingestionSuspendedAt: null })
    mocks.createDelivery.mockResolvedValue({ id: 'webhook-1' })
    mocks.createJob.mockResolvedValue({ id: 'job-1' })
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      webhookDelivery: { create: mocks.createDelivery },
      gitHubLifecycleDelivery: { create: mocks.createLifecycleDelivery },
      gitHubInstallationLifecycle: { upsert: mocks.upsertLifecycle },
      project: { updateMany: mocks.updateProjects },
      job: { create: mocks.createJob },
      $queryRaw: mocks.advisoryLock,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.GITHUB_WEBHOOK_SECRET
    delete process.env.WEBHOOK_MAX_BODY_BYTES
  })

  it('accepts a valid signed Unicode payload and resolves by repository and installation', async () => {
    const response = await POST(signedRequest(JSON.stringify(payload)))

    expect(response.status).toBe(202)
    expect(mocks.findProject).toHaveBeenCalledWith({
      where: {
        githubInstallationId: '42',
        githubRepositoryId: '7',
        githubBindingStatus: 'active',
      },
      select: { id: true, ownerId: true, externalInferenceEnabled: true, inferenceSuspendedAt: true, ingestionSuspendedAt: true },
    })
    expect(mocks.createDelivery).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: '7:10:closed:true',
        payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        payload,
      }),
    })
    expect(mocks.createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'WEBHOOK',
        ownerId: 'user-1',
        webhookDeliveryId: 'webhook-1',
      }),
    })
  })

  it('persists only the validated redacted payload allowlist while retaining the raw digest', async () => {
    const secretPayload = {
      ...payload,
      sender: { login: 'not-in-allowlist' },
      pull_request: { ...payload.pull_request, body: `token=${`ghp_${'a'.repeat(40)}`}` },
    }
    const response = await POST(signedRequest(JSON.stringify(secretPayload), { 'x-github-delivery': 'delivery-redacted' }))
    expect(response.status).toBe(202)
    expect(mocks.createDelivery).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          pull_request: expect.objectContaining({ body: 'token=[REDACTED]' }),
        }),
        payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    })
    const stored = mocks.createDelivery.mock.calls.at(-1)?.[0].data.payload
    expect(stored).not.toHaveProperty('sender')
  })

  it('rejects a missing signature before processing', async () => {
    const request = signedRequest(JSON.stringify(payload))
    request.headers.delete('x-hub-signature-256')

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(mocks.findProject).not.toHaveBeenCalled()
  })

  it('rejects an incorrect or modified-body signature', async () => {
    const body = JSON.stringify(payload)
    const request = signedRequest(body.replace('Résumé', 'Resume'))
    request.headers.set(
      'x-hub-signature-256',
      `sha256=${createHmac('sha256', 'test-webhook-secret').update(body, 'utf8').digest('hex')}`,
    )

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(mocks.findProject).not.toHaveBeenCalled()
  })

  it('acknowledges a replay or semantic duplicate without creating another job', async () => {
    mocks.createDelivery.mockRejectedValueOnce({ code: 'P2002' })

    const response = await POST(signedRequest(JSON.stringify(payload)))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({ replay: true })
  })

  it('rejects a repository or installation mismatch', async () => {
    mocks.findProject.mockResolvedValueOnce(null)

    const response = await POST(signedRequest(JSON.stringify(payload)))

    expect(response.status).toBe(404)
    expect(mocks.createDelivery).not.toHaveBeenCalled()
  })

  it('rejects an excessive body from content length before reading it', async () => {
    const request = signedRequest(JSON.stringify(payload), { 'content-length': '1000001' })

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(mocks.findProject).not.toHaveBeenCalled()
  })

  it('serializes and durably records installation revocation before disabling bindings', async () => {
    const lifecyclePayload = { action: 'suspend', installation: { id: 42 } }
    const response = await POST(signedRequest(JSON.stringify(lifecyclePayload), {
      'x-github-event': 'installation',
      'x-github-delivery': 'delivery-suspend',
    }))

    expect(response.status).toBe(202)
    expect(mocks.advisoryLock).toHaveBeenCalledOnce()
    expect(mocks.createLifecycleDelivery).toHaveBeenCalledWith({
      data: expect.objectContaining({ deliveryId: 'delivery-suspend', installationId: '42', action: 'suspend' }),
    })
    expect(mocks.upsertLifecycle).toHaveBeenCalledWith({
      where: { installationId: '42' },
      create: expect.objectContaining({ installationId: '42', status: 'suspend', deliveryId: 'delivery-suspend' }),
      update: expect.objectContaining({ status: 'suspend', deliveryId: 'delivery-suspend', revision: { increment: 1 } }),
    })
    expect(mocks.updateProjects).toHaveBeenCalledWith({
      where: { githubInstallationId: '42' },
      data: { githubBindingStatus: 'suspend', githubBindingDisabledAt: expect.any(Date) },
    })
  })
})

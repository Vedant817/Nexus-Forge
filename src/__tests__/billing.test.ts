import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))

vi.mock('@/lib/db/prisma', () => ({ default: { $transaction: mocks.transaction } }))

import { POST } from '@/app/api/webhooks/stripe/route'

function stripeSignedRequest(body: string, secret: string): Request {
  const timestamp = Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${body}`
  const signature = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` },
  })
}

describe('Stripe billing webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'
    mocks.transaction.mockImplementation(async (callback: (tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>) => unknown) => callback({
      billingWebhookEvent: { create: vi.fn(async () => ({})) },
      billingCustomer: { findUnique: vi.fn(async () => null) },
      subscription: { upsert: vi.fn(async () => ({})) },
      entitlementSnapshot: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    } as never))
  })

  it('rejects invalid signatures without touching billing state', async () => {
    const request = stripeSignedRequest('{"id":"evt_1","type":"customer.subscription.updated"}', 'wrong-secret')
    const response = await POST(request)
    expect(response.status).toBe(401)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('processes each event once and survives duplicates and reorder', async () => {
    const body = JSON.stringify({ id: 'evt_1', object: 'event', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_x' } }] }, current_period_end: Math.floor(Date.now() / 1000) + 3600, cancel_at_period_end: false } } })
    const first = await POST(stripeSignedRequest(body, 'whsec_test'))
    expect(first.status).toBe(200)
    mocks.transaction.mockRejectedValueOnce({ code: 'P2002' })
    const duplicate = await POST(stripeSignedRequest(body, 'whsec_test'))
    expect(duplicate.status).toBe(200)
    await expect(duplicate.json()).resolves.toMatchObject({ duplicate: true })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  checkoutCreate: vi.fn(),
  Stripe: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireSession: mocks.requireSession }))
vi.mock('stripe', () => ({ default: mocks.Stripe }))

import { POST } from '@/app/api/billing/checkout/route'

function checkoutRequest(body: unknown): Request {
  return new Request('https://app.example.com/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  priceId: 'price_pilot',
  successUrl: 'https://app.example.com/billing?done=1',
  cancelUrl: 'https://app.example.com/billing?canceled=1',
}

describe('POST billing checkout', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockClear()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder')
    process.env.STRIPE_PRICE_PILOT_MONTHLY = 'price_pilot'
    mocks.requireSession.mockResolvedValue({ ok: true, value: { id: 'user-1' } })
    mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session/1' })
    mocks.Stripe.mockImplementation(function (this: unknown) {
      return { checkout: { sessions: { create: mocks.checkoutCreate } } }
    } as never)
  })

  it('creates a checkout session for a configured price and same-origin URLs', async () => {
    const response = await POST(checkoutRequest(validBody))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ url: 'https://checkout.stripe.com/session/1' })
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      line_items: [{ price: 'price_pilot', quantity: 1 }],
      client_reference_id: 'user-1',
    }))
  })

  it('rejects unconfigured price ids that would pay for no entitlement', async () => {
    const response = await POST(checkoutRequest({ ...validBody, priceId: 'price_attacker' }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('Unknown price') })
    expect(mocks.checkoutCreate).not.toHaveBeenCalled()
  })

  it('rejects cross-origin success and cancel URLs', async () => {
    for (const body of [
      { ...validBody, successUrl: 'https://evil.example.net/win' },
      { ...validBody, cancelUrl: 'https://evil.example.net/lose' },
    ]) {
      const response = await POST(checkoutRequest(body))
      expect(response.status).toBe(400)
    }
    expect(mocks.checkoutCreate).not.toHaveBeenCalled()
  })

  it('returns 503 without Stripe configured and 401 without a session', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect((await POST(checkoutRequest(validBody))).status).toBe(503)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder')
    mocks.requireSession.mockResolvedValue({ ok: false, response: new Response('unauthorized', { status: 401 }) })
    expect((await POST(checkoutRequest(validBody))).status).toBe(401)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  membershipFindFirst: vi.fn(),
  customerFindFirst: vi.fn(),
  portalCreate: vi.fn(),
  Stripe: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    membership: { findFirst: mocks.membershipFindFirst },
    billingCustomer: { findFirst: mocks.customerFindFirst },
  },
}))
vi.mock('stripe', () => ({ default: mocks.Stripe }))

import { POST } from '@/app/api/billing/portal/route'

function portalRequest(returnUrl: string): Request {
  return new Request('https://app.example.com/api/billing/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl }),
  })
}

describe('POST billing portal', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockClear()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder')
    mocks.requireSession.mockResolvedValue({ ok: true, value: { id: 'user-1' } })
    mocks.membershipFindFirst.mockResolvedValue({ organizationId: 'org-1' })
    mocks.customerFindFirst.mockResolvedValue({ stripeCustomerId: 'cus_1' })
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session/1' })
    mocks.Stripe.mockImplementation(function (this: unknown) {
      return { billingPortal: { sessions: { create: mocks.portalCreate } } }
    } as never)
  })

  it('creates a portal session for a same-origin return URL', async () => {
    const response = await POST(portalRequest('https://app.example.com/billing'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ url: 'https://billing.stripe.com/session/1' })
    expect(mocks.portalCreate).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'https://app.example.com/billing' })
  })

  it('rejects cross-origin return URLs instead of creating an open redirect', async () => {
    const response = await POST(portalRequest('https://evil.example.net/collect'))
    expect(response.status).toBe(400)
    expect(mocks.portalCreate).not.toHaveBeenCalled()
  })

  it('selects memberships deterministically', async () => {
    await POST(portalRequest('https://app.example.com/billing'))
    expect(mocks.membershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' }, orderBy: { createdAt: 'asc' } }),
    )
  })

  it('maps provider failures to 502 without leaking internals', async () => {
    mocks.portalCreate.mockRejectedValueOnce(new Error('StripeInvalidRequestError: No such customer'))
    const response = await POST(portalRequest('https://app.example.com/billing'))
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'Billing provider unavailable. Please try again.' })
  })

  it('returns 404 without a billing customer and 503 without Stripe configured', async () => {
    mocks.customerFindFirst.mockResolvedValue(null)
    expect((await POST(portalRequest('https://app.example.com/billing'))).status).toBe(404)
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect((await POST(portalRequest('https://app.example.com/billing'))).status).toBe(503)
  })
})

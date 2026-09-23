import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import prisma from '@/lib/db/prisma'
import { readBoundedWebhookBody, WebhookBodyTooLargeError } from '@/lib/github/webhook-security'
import { logStructured } from '@/lib/observability/logger'
import { GRACE_PERIOD_MS, PLAN_ALLOWANCES, planForPrice } from '@/lib/billing/plans'

const MAX_BODY_BYTES = 1_000_000

class UnknownStripePriceError extends Error {
  constructor(public readonly priceId?: string) {
    super(`Unknown Stripe price id: ${priceId ?? 'missing'}`)
    this.name = 'UnknownStripePriceError'
  }
}

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key)
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) return NextResponse.json({ error: 'Billing webhooks are not configured' }, { status: 503 })
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 401 })
  let rawBody: Buffer
  try {
    rawBody = await readBoundedWebhookBody(request, MAX_BODY_BYTES)
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 })
    return NextResponse.json({ error: 'Billing webhook configuration is invalid' }, { status: 503 })
  }
  let event: Stripe.Event
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 401 })
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.billingWebhookEvent.create({ data: { stripeEventId: event.id, type: event.type } })
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as unknown as Record<string, unknown>
        const subscriptionId = String(subscription.id ?? '')
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer as { id?: string } | null)?.id ?? ''
        const customer = customerId ? await tx.billingCustomer.findUnique({ where: { stripeCustomerId: customerId } }) : null
        const items = (subscription.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? []
        const priceId = items[0]?.price?.id
        const plan = planForPrice(priceId)
        if (!plan) {
          // Fail loudly, never silently downgrade: Stripe retries non-2xx for review.
          throw new UnknownStripePriceError(priceId)
        }
        const allowances = PLAN_ALLOWANCES[plan] ?? PLAN_ALLOWANCES.pilot
        const status = String(subscription.status ?? 'unknown')
        const active = ['trialing', 'active'].includes(status)
        const inGrace = status === 'past_due'
        const periodEndSeconds = typeof subscription.current_period_end === 'number' ? subscription.current_period_end as number : null
        const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end ?? false)
        await tx.subscription.upsert({
          where: { stripeSubscriptionId: subscriptionId },
          create: {
            organizationId: customer?.organizationId ?? undefined, userId: customer && !customer.organizationId ? customer.userId : undefined,
            stripeSubscriptionId: subscriptionId, plan, status,
            currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
            cancelAtPeriodEnd,
          },
          update: {
            plan, status,
            currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
            cancelAtPeriodEnd,
          },
        })
        const suspended = !active && !(inGrace && periodEndSeconds != null && Date.now() - (periodEndSeconds * 1000) < GRACE_PERIOD_MS) || status === 'canceled'
        const latest = customer?.organizationId
          ? await tx.entitlementSnapshot.findFirst({ where: { organizationId: customer.organizationId }, orderBy: { revision: 'desc' } })
          : await tx.entitlementSnapshot.findFirst({ where: { userId: customer?.userId ?? '' }, orderBy: { revision: 'desc' } })
        await tx.entitlementSnapshot.create({
          data: {
            organizationId: customer?.organizationId ?? undefined, userId: customer && !customer.organizationId ? customer.userId : undefined,
            revision: (latest?.revision ?? 0) + 1,
            allowances: { ...allowances, plan, suspended, expiresAt: periodEndSeconds ? new Date(periodEndSeconds * 1000).toISOString() : null },
            source: 'stripe',
          },
        })
      }
    })
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    if (error instanceof UnknownStripePriceError) {
      logStructured('error', 'Stripe webhook referenced an unknown price id; no entitlement change applied', { action: event.type })
      return NextResponse.json({ error: 'Unknown Stripe price id; no entitlement change applied.' }, { status: 400 })
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
    }
    throw error
  }
}

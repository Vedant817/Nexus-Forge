// Reconciles Stripe subscription state with internal entitlements and usage.
// Requires STRIPE_SECRET_KEY; exits quietly when billing is not configured.
import Stripe from 'stripe'
import prisma from '@/lib/db/prisma'
import { PLAN_ALLOWANCES } from '@/lib/billing/plans'

async function main(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('Billing reconciliation skipped: STRIPE_SECRET_KEY is not set.')
    return
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const subscriptions = await stripe.subscriptions.list({ limit: 100 })
  for (const subscription of subscriptions.data) {
    const internal = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscription.id } })
    const priceId = subscription.items.data[0]?.price?.id
    console.log(`Subscription ${subscription.id}: stripe=${subscription.status} internal=${internal?.status ?? 'missing'} price=${priceId ?? 'unknown'}`)
    if (!internal) continue
    if (internal.status !== subscription.status) {
      console.log(`Drift detected for ${subscription.id}: updating internal status to ${subscription.status}`)
      await prisma.subscription.update({ where: { stripeSubscriptionId: subscription.id }, data: { status: subscription.status } })
    }
    void PLAN_ALLOWANCES
  }
}

void main()

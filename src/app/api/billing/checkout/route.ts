import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { requireSession } from '@/lib/auth/authorization'
import { planForPrice } from '@/lib/billing/plans'

const checkoutSchema = z.object({ priceId: z.string().min(1).max(200), successUrl: z.string().url().max(500), cancelUrl: z.string().url().max(500) }).strict()

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 })
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout request.' }, { status: 400 })
  // Only configured prices can start a subscription: an arbitrary price id
  // would either pay for nothing (webhook rejects unknown prices) or the
  // wrong plan. Fail closed here instead.
  if (!planForPrice(parsed.data.priceId)) {
    return NextResponse.json({ error: 'Unknown price for checkout.' }, { status: 400 })
  }
  // Constrain post-checkout navigation to this application so the session
  // cannot be turned into an open redirect.
  const origin = new URL(request.url).origin
  if (new URL(parsed.data.successUrl).origin !== origin || new URL(parsed.data.cancelUrl).origin !== origin) {
    return NextResponse.json({ error: 'Invalid checkout request.' }, { status: 400 })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: parsed.data.priceId, quantity: 1 }],
    success_url: parsed.data.successUrl,
    cancel_url: parsed.data.cancelUrl,
    client_reference_id: session.value.id,
  })
  return NextResponse.json({ url: checkout.url })
}

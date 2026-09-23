import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

const portalSchema = z.object({ returnUrl: z.string().url().max(500) }).strict()

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 })
  const parsed = portalSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid portal request.' }, { status: 400 })
  // The portal returns to the caller's session after Stripe. Constrain the
  // return target to this application's origin so a compromised or careless
  // client cannot turn the portal into an open redirect.
  if (new URL(parsed.data.returnUrl).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid portal request.' }, { status: 400 })
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: session.value.id },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  })
  const customer = await prisma.billingCustomer.findFirst({
    where: membership ? { organizationId: membership.organizationId } : { userId: session.value.id },
    select: { stripeCustomerId: true },
  })
  if (!customer) return NextResponse.json({ error: 'No billing customer found for this account yet.' }, { status: 404 })
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: parsed.data.returnUrl,
  })
  return NextResponse.json({ url: portal.url })
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { authenticateServiceAccount } from '@/lib/integrations/service-accounts'

// Minimal SCIM 2.0 Users: list and provision/deprovision via service-account token.
export async function GET(request: Request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  const account = await authenticateServiceAccount(token)
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await prisma.user.findMany({ take: 50, select: { id: true, email: true } })
  return NextResponse.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: users.length, Resources: users })
}

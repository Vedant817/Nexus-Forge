import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { authenticateServiceAccount } from '@/lib/integrations/service-accounts'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  const account = await authenticateServiceAccount(token)
  if (!account || !account.scopes.includes('runs:read')) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Valid service-account token with runs:read is required.' } }, { status: 401 })
  }
  const url = new URL(request.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20) || 20))
  const cursor = url.searchParams.get('cursor')
  const runs = await prisma.analysisRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, projectId: true, status: true, processingMode: true, createdAt: true },
  })
  const response = NextResponse.json({ data: runs.slice(0, limit), nextCursor: runs.length > limit ? runs[limit].id : null, version: 'v1' })
  const correlation = request.headers.get('x-correlation-id')
  if (correlation) response.headers.set('x-correlation-id', correlation.slice(0, 200))
  return response
}

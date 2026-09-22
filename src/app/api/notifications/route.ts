import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const notifications = await prisma.notification.findMany({
    where: { userId: session.value.id }, orderBy: { createdAt: 'desc' }, take: 50,
  })
  return NextResponse.json({ notifications })
}

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const { notificationId } = await request.json().catch(() => ({})) as { notificationId?: string }
  if (!notificationId) return NextResponse.json({ error: 'notificationId is required.' }, { status: 400 })
  await prisma.notification.updateMany({ where: { id: notificationId, userId: session.value.id }, data: { readAt: new Date() } })
  return NextResponse.json({ read: true })
}

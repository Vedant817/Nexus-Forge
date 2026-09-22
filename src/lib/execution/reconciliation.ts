import prisma from '@/lib/db/prisma'

export async function reconcileOrphanedReservations(olderThanMs = 30 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const orphaned = await prisma.aiTokenReservation.findMany({
    where: { status: 'RESERVED', createdAt: { lt: cutoff } },
    select: { id: true },
  })
  if (!orphaned.length) return 0
  await prisma.aiTokenReservation.updateMany({
    where: { id: { in: orphaned.map((row) => row.id) }, status: 'RESERVED' },
    data: { status: 'RELEASED', settledAt: new Date() },
  })
  return orphaned.length
}

export async function cleanupRateLimitBuckets(olderThanMs = 2 * 3600_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const deleted = await prisma.rateLimitBucket.deleteMany({ where: { updatedAt: { lt: cutoff } } })
  return deleted.count
}

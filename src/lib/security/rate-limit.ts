import 'server-only'

import prisma from '@/lib/db/prisma'

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
}

type RateLimitRow = {
  count: number
  windowStart: Date
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = defaultConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!Number.isInteger(config.windowMs) || config.windowMs <= 0) {
    throw new Error('Rate-limit windowMs must be a positive integer.')
  }
  if (!Number.isInteger(config.maxRequests) || config.maxRequests <= 0) {
    throw new Error('Rate-limit maxRequests must be a positive integer.')
  }
  if (!key || key.length > 200) throw new Error('Rate-limit key must contain 1-200 characters.')

  const now = new Date()
  const expiredBefore = new Date(now.getTime() - config.windowMs)
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "updatedAt")
    VALUES (${key}, ${now}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" <= ${expiredBefore} THEN ${now}
        ELSE "RateLimitBucket"."windowStart"
      END,
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" <= ${expiredBefore} THEN 1
        ELSE LEAST("RateLimitBucket"."count" + 1, ${config.maxRequests + 1})
      END,
      "updatedAt" = ${now}
    RETURNING "count", "windowStart"
  `

  const row = rows[0]
  const allowed = row.count <= config.maxRequests
  return {
    allowed,
    remaining: Math.max(0, config.maxRequests - row.count),
    resetAt: row.windowStart.getTime() + config.windowMs,
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key } })
}

export async function pruneExpiredRateLimits(olderThan: Date): Promise<number> {
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { updatedAt: { lt: olderThan } },
  })
  return result.count
}

import prisma from '@/lib/db/prisma'

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 10,
}

export async function checkRateLimit(key: string, config: RateLimitConfig = defaultConfig): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now()
  const cutoff = new Date(now - config.windowMs)

  try {
    const count = await prisma.auditLog.count({
      where: {
        action: 'rate_limit_check',
        projectId: key,
        createdAt: { gte: cutoff }
      }
    })

    if (count >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: now + config.windowMs }
    }

    await prisma.auditLog.create({
      data: {
        projectId: key,
        action: 'rate_limit_check',
        details: 'Rate limit hit recorded'
      }
    })

    return { allowed: true, remaining: config.maxRequests - count - 1, resetAt: now + config.windowMs }
  } catch (err) {
    // If DB fails, allow request to prevent blocking the app
    return { allowed: true, remaining: 1, resetAt: now + config.windowMs }
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  try {
    await prisma.auditLog.deleteMany({
      where: {
        action: 'rate_limit_check',
        projectId: key
      }
    })
  } catch (err) {}
}

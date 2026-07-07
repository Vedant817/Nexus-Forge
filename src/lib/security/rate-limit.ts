// In-memory rate limiter — Edge Runtime compatible (no Node.js / Prisma deps)

interface WindowEntry {
  count: number
  resetAt: number
}

const store = new Map<string, WindowEntry>()

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60, // generous limit for normal browsing
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = defaultConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    // New window
    const resetAt = now + config.windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count += 1
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

export async function resetRateLimit(key: string): Promise<void> {
  store.delete(key)
}

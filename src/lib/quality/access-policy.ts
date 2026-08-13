import type { AuthenticatedUser } from '@/lib/auth/authorization'

export function canUseQualityOrchestrator(user: AuthenticatedUser): boolean {
  if (process.env.QUALITY_ORCHESTRATOR_ENABLED?.toLowerCase() !== 'true') return false
  if (process.env.NODE_ENV === 'production') return false

  const allowedEmails = new Set(
    (process.env.QUALITY_ORCHESTRATOR_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )

  return allowedEmails.has(user.email.toLowerCase())
}

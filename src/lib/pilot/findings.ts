export const FINDING_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'EXCEPTION_REQUESTED', 'WAIVED', 'RESOLVED', 'REGRESSED'] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

export function isWaiverExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime())
}

export function shouldReopenOnRegression(currentStatus: string, criterionStatus: string): boolean {
  return criterionStatus === 'FAIL' && (currentStatus === 'RESOLVED' || currentStatus === 'WAIVED')
}

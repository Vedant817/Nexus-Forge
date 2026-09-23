export const PLAN_ALLOWANCES: Record<string, { maxRunsPerDay: number; maxExportsPerDay: number; maxProjects: number }> = {
  pilot: { maxRunsPerDay: 10, maxExportsPerDay: 50, maxProjects: 50 },
  pro: { maxRunsPerDay: 50, maxExportsPerDay: 200, maxProjects: 200 },
  team: { maxRunsPerDay: 200, maxExportsPerDay: 1000, maxProjects: 1000 },
}

export const GRACE_PERIOD_MS = 7 * 24 * 3600_000

export function planForPrice(priceId: string | null | undefined): string | null {
  const table: Record<string, string> = {
    [process.env.STRIPE_PRICE_PILOT_MONTHLY ?? '']: 'pilot',
    [process.env.STRIPE_PRICE_PRO_MONTHLY ?? '']: 'pro',
    [process.env.STRIPE_PRICE_TEAM_MONTHLY ?? '']: 'team',
  }
  if (!priceId || !(priceId in table)) return null
  return table[priceId]
}

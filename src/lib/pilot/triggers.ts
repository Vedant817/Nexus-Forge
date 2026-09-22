export type TriggerSettingsInput = {
  debounceMinutes: number
  quietStartHour?: number | null
  quietEndHour?: number | null
  materialityThreshold: number
  digestEnabled: boolean
}

export function isQuietNow(settings: Pick<TriggerSettingsInput, 'quietStartHour' | 'quietEndHour'>, now = new Date()): boolean {
  const { quietStartHour, quietEndHour } = settings
  if (quietStartHour == null || quietEndHour == null) return false
  const hour = now.getUTCHours()
  if (quietStartHour <= quietEndHour) return hour >= quietStartHour && hour < quietEndHour
  return hour >= quietStartHour || hour < quietEndHour
}

export function shouldCoalesce(lastRunAt: Date | null, debounceMinutes: number, now = new Date()): boolean {
  if (!lastRunAt) return false
  return now.getTime() - lastRunAt.getTime() < debounceMinutes * 60_000
}

export function isMaterialChange(changeCount: number, threshold: number): boolean {
  return changeCount >= threshold
}

import { z } from 'zod'

export const PROFILE_PRESETS = ['Fast', 'Standard', 'Strict'] as const
export type ProfilePreset = (typeof PROFILE_PRESETS)[number]

export const profileControlsSchema = z.object({
  maxSources: z.number().int().min(1).max(20),
  maxContentLength: z.number().int().min(1000).max(100000),
  maxFiles: z.number().int().min(100).max(5000),
  includePRChecks: z.boolean(),
  verbosity: z.enum(['concise', 'standard', 'detailed']),
}).strict()

export type ProfileControls = z.infer<typeof profileControlsSchema>

export const PRESET_CONTROLS: Record<ProfilePreset, ProfileControls> = {
  Fast: { maxSources: 5, maxContentLength: 20000, maxFiles: 500, includePRChecks: false, verbosity: 'concise' },
  Standard: { maxSources: 10, maxContentLength: 50000, maxFiles: 1500, includePRChecks: true, verbosity: 'standard' },
  Strict: { maxSources: 20, maxContentLength: 100000, maxFiles: 5000, includePRChecks: true, verbosity: 'detailed' },
}

export const CURATED_TEMPLATES: Array<{ name: string; description: string; controls: ProfileControls }> = [
  { name: 'web-app', description: 'Web application review with standard depth.', controls: PRESET_CONTROLS.Standard },
  { name: 'api-service', description: 'API service review with strict checks.', controls: PRESET_CONTROLS.Strict },
  { name: 'quick-triage', description: 'Fast triage with minimal collection.', controls: PRESET_CONTROLS.Fast },
]

export function policyLayerSource(setting: string): string {
  if (['maxSources', 'maxContentLength'].includes(setting)) return 'entitlement'
  if (['maxFiles', 'includePRChecks', 'verbosity'].includes(setting)) return 'profile'
  return 'defaults'
}

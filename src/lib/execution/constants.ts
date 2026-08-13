import { AnalysisStageName } from '@prisma/client'

export const ANALYSIS_STAGES = [
  AnalysisStageName.KNOWLEDGE,
  AnalysisStageName.REPOSITORY,
  AnalysisStageName.WORKFLOW,
  AnalysisStageName.RELEASE,
  AnalysisStageName.PROOF,
] as const

export const PIPELINE_VERSION = 'evidence-ledger-v2'
export const PROMPT_VERSION = 'evidence-first-v2'
export const MODEL_CONFIG_VERSION = 'groq-v1'
export const DEFAULT_LEASE_MS = 60_000
export const DEFAULT_MAX_ATTEMPTS = 5

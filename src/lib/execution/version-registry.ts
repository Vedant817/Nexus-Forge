import { AnalysisStageName } from '@prisma/client'
import { z } from 'zod'
import { MODEL_CONFIG_VERSION, PIPELINE_VERSION, PROMPT_VERSION } from './constants'
import config from '@/lib/config/env'
import { ModelConfigurationError } from '@/lib/ai/errors'

const modelConfigSchema = z.object({
  provider: z.literal('groq'),
  model: z.string().min(1).max(200),
}).strict()

export type PersistedExecutionVersion = {
  pipelineVersion: string
  promptVersion: string
  modelConfigVersion: string
  modelConfig: unknown
}

export type StageExecutionIdentity = {
  promptId: string
  promptVersion: string
  schemaVersion: string
}

export type ResolvedExecutionVersion = {
  provider: 'groq'
  model: string
  structuredOutputCapability: 'unknown'
  enforcementBoundary: 'ai-sdk-json-schema-parser'
  stages: Readonly<Record<AnalysisStageName, StageExecutionIdentity>>
}

type VersionDispatcher = (modelConfig: unknown) => ResolvedExecutionVersion

const versionKey = (pipeline: string, prompt: string, modelConfig: string) =>
  `${pipeline}:${prompt}:${modelConfig}`

export const STAGE_EXECUTION_REGISTRY: Readonly<Record<AnalysisStageName, StageExecutionIdentity>> = Object.freeze({
  [AnalysisStageName.KNOWLEDGE]: Object.freeze({ promptId: 'knowledge-distiller', promptVersion: '1', schemaVersion: '1' }),
  [AnalysisStageName.REPOSITORY]: Object.freeze({ promptId: 'repo-context-agent', promptVersion: '2', schemaVersion: '2' }),
  [AnalysisStageName.WORKFLOW]: Object.freeze({ promptId: 'workflow-planner', promptVersion: '1', schemaVersion: '1' }),
  [AnalysisStageName.RELEASE]: Object.freeze({ promptId: 'release-readiness', promptVersion: '2', schemaVersion: '2' }),
  [AnalysisStageName.PROOF]: Object.freeze({ promptId: 'proof-of-work', promptVersion: '2', schemaVersion: '2' }),
})

export function assertGroqModelAllowed(model: string): void {
  if (!config.GROQ_ALLOWED_MODELS.includes(model)) {
    throw new ModelConfigurationError('The persisted Groq model is not in the deployment allowlist.')
  }
}

export const EXECUTION_VERSION_REGISTRY: Readonly<Record<string, VersionDispatcher>> = Object.freeze({
  [versionKey(PIPELINE_VERSION, PROMPT_VERSION, MODEL_CONFIG_VERSION)]: (modelConfig) => {
    const parsed = modelConfigSchema.parse(modelConfig)
    assertGroqModelAllowed(parsed.model)
    return {
    ...parsed,
    // Groq has not been attested to strict json_schema conformance for the default model.
    // Validation and conservative repair at the AI SDK boundary remain authoritative.
    structuredOutputCapability: 'unknown',
    enforcementBoundary: 'ai-sdk-json-schema-parser',
    stages: STAGE_EXECUTION_REGISTRY,
    }
  },
})

export function resolveExecutionVersion(version: PersistedExecutionVersion): ResolvedExecutionVersion {
  const dispatcher = EXECUTION_VERSION_REGISTRY[
    versionKey(version.pipelineVersion, version.promptVersion, version.modelConfigVersion)
  ]
  if (!dispatcher) throw new Error('Unsupported persisted pipeline, prompt, or model configuration version.')
  return dispatcher(version.modelConfig)
}

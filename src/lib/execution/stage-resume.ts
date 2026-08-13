export type StageResumeDecision = 'execute' | 'resume' | 'invalid'

export type PersistedStageIdentity = {
  promptId: string | null
  promptVersion: string | null
  agentSchemaVersion: string | null
  requestedProvider: string | null
  requestedModel: string | null
}

export type ExpectedStageIdentity = {
  promptId: string
  promptVersion: string
  schemaVersion: string
  requestedProvider: string
  requestedModel: string
}

export function stageIdentityMatches(
  persisted: PersistedStageIdentity,
  expected: ExpectedStageIdentity,
): boolean {
  return persisted.promptId === expected.promptId
    && persisted.promptVersion === expected.promptVersion
    && persisted.agentSchemaVersion === expected.schemaVersion
    && persisted.requestedProvider === expected.requestedProvider
    && persisted.requestedModel === expected.requestedModel
}

export function decideStageResume(status: string, artifactIntegrityMatches: boolean): StageResumeDecision {
  if (status !== 'SUCCEEDED' && status !== 'SKIPPED') return 'execute'
  return artifactIntegrityMatches ? 'resume' : 'invalid'
}

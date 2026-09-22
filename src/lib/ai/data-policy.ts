import { contentHash } from '@/lib/execution/hash'

export const ADMISSION_MANIFEST_VERSION = 'admission-manifest-v1'
export const PRIVACY_ACK_VERSION = 'privacy-ack-v1'

export type ProcessingMode = 'DETERMINISTIC_ONLY' | 'INFERENCE_ENABLED'

type ProjectPolicy = {
  githubRepositoryPrivate?: boolean | null
  externalInferenceEnabled: boolean
  externalInferenceAuthorizedBy?: string | null
  externalInferenceAuthorizedAt?: Date | null
  ingestionSuspendedAt?: Date | null
  inferenceSuspendedAt?: Date | null
}

export function isIngestionEnabled(): boolean {
  return process.env.INGESTION_DISABLED?.toLowerCase() !== 'true'
}

export function assertIngestionEnabled(): void {
  if (!isIngestionEnabled()) throw new Error('Ingestion is temporarily disabled.')
}

export function resolveProcessingMode(project: ProjectPolicy, globalInferenceEnabled: boolean): ProcessingMode {
  if (!globalInferenceEnabled) return 'DETERMINISTIC_ONLY'
  if (project.inferenceSuspendedAt) return 'DETERMINISTIC_ONLY'
  if (typeof project.githubRepositoryPrivate !== 'boolean') return 'DETERMINISTIC_ONLY'
  if (!project.externalInferenceEnabled) return 'DETERMINISTIC_ONLY'
  if (!project.externalInferenceAuthorizedBy || !project.externalInferenceAuthorizedAt) return 'DETERMINISTIC_ONLY'
  return 'INFERENCE_ENABLED'
}

export function buildAdmissionManifest(input: {
  projectId: string
  ownerId: string
  actorId: string
  processingMode: ProcessingMode
  repositoryPrivate: boolean | null
  repositoryFullName?: string | null
  repositoryId?: string | null
  installationId?: string | null
  inputHash: string
  pipelineVersion: string
  collectorVersion: string
  scorecardVersion: string
  modelConfig: unknown
}): { manifest: Record<string, unknown>; digest: string } {
  const manifest = {
    version: ADMISSION_MANIFEST_VERSION,
    projectId: input.projectId,
    ownerId: input.ownerId,
    actorId: input.actorId,
    processingMode: input.processingMode,
    repository: {
      private: input.repositoryPrivate,
      fullName: input.repositoryFullName ?? null,
      repositoryId: input.repositoryId ?? null,
      installationId: input.installationId ?? null,
    },
    inputHash: input.inputHash,
    pipelineVersion: input.pipelineVersion,
    collectorVersion: input.collectorVersion,
    scorecardVersion: input.scorecardVersion,
    modelConfig: input.modelConfig,
    privacyAckVersion: input.processingMode === 'INFERENCE_ENABLED' ? PRIVACY_ACK_VERSION : null,
    createdAt: new Date().toISOString(),
  }
  return { manifest, digest: contentHash(manifest) }
}

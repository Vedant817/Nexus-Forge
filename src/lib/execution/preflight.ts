import { randomUUID } from 'node:crypto'
import { contentHash } from '@/lib/execution/hash'
import { PIPELINE_VERSION, PROMPT_VERSION, MODEL_CONFIG_VERSION } from '@/lib/execution/constants'
import { COLLECTOR_VERSION, SCORECARD_VERSION } from '@/lib/evidence/registry'
import { ADMISSION_MANIFEST_VERSION, PRIVACY_ACK_VERSION, resolveProcessingMode } from '@/lib/ai/data-policy'
import { isInferenceEnabled } from '@/lib/ai/inference-policy'

const CODE_VERSION = process.env.APP_CODE_VERSION ?? 'dev'
const RETENTION_CLASS = process.env.RETENTION_CLASS ?? 'pilot-default'

export type PreflightProject = {
  id: string
  ownerId: string | null
  repoUrl: string
  prUrl: string
  githubRepositoryFullName?: string | null
  githubRepositoryId?: string | null
  githubInstallationId?: string | null
  githubBindingStatus?: string | null
  githubRepositoryPrivate?: boolean | null
  externalInferenceEnabled: boolean
  externalInferenceAuthorizedBy?: string | null
  externalInferenceAuthorizedAt?: Date | null
  ingestionSuspendedAt?: Date | null
  inferenceSuspendedAt?: Date | null
  sources: Array<{ id: string; type: string; title: string; content: string }>
}

export function preflightAdmission(input: { project: PreflightProject; actorId: string; inputSnapshot: unknown; inputHash: string; modelConfig: unknown }) {
  const { project, actorId } = input
  if (!project.ownerId || project.ownerId !== actorId) throw new Error('Project authorization failed.')
  if (project.ingestionSuspendedAt) throw new Error('Ingestion is suspended for this project.')
  if ((project.repoUrl || project.prUrl) && process.env.NODE_ENV === 'production') {
    if (project.githubBindingStatus !== 'active' || !project.githubInstallationId || !project.githubRepositoryId) {
      throw new Error('Repository access is not authorized for this project.')
    }
  }
  const processingMode = resolveProcessingMode(project, isInferenceEnabled())
  if (processingMode === 'INFERENCE_ENABLED' && (!project.externalInferenceAuthorizedBy || !project.externalInferenceAuthorizedAt)) {
    throw new Error('External inference acknowledgement is required.')
  }
  const maxSources = Number(process.env.MAX_SOURCES_PER_PROJECT ?? 20)
  if (project.sources.length > maxSources) throw new Error('Source quota exceeded.')
  const maxContent = Number(process.env.ANALYSIS_MAX_CONTENT_LENGTH ?? 100000)
  for (const source of project.sources) {
    if (source.content.length > maxContent) throw new Error('Source content exceeds the configured limit.')
  }
  if (!PIPELINE_VERSION || !COLLECTOR_VERSION || !SCORECARD_VERSION || !PROMPT_VERSION) {
    throw new Error('Required pipeline version is unavailable.')
  }
  const requestId = randomUUID()
  const manifest = {
    version: ADMISSION_MANIFEST_VERSION,
    canonicalVersion: 1,
    requestId,
    tenantId: project.ownerId,
    actorId,
    projectId: project.id,
    repository: {
      fullName: project.githubRepositoryFullName ?? null,
      repositoryId: project.githubRepositoryId ?? null,
      installationId: project.githubInstallationId ?? null,
      private: project.githubRepositoryPrivate ?? null,
      repoUrl: project.repoUrl,
      prUrl: project.prUrl,
    },
    sources: project.sources.map((source) => ({ id: source.id, digest: contentHash({ type: source.type, title: source.title, content: source.content }) })),
    inputHash: input.inputHash,
    pipelineVersion: PIPELINE_VERSION,
    promptVersion: PROMPT_VERSION,
    modelConfigVersion: input.modelConfig && (input.modelConfig as { provider?: string }).provider !== 'none' ? MODEL_CONFIG_VERSION : 'deterministic-v1',
    collectorVersion: COLLECTOR_VERSION,
    scorecardVersion: SCORECARD_VERSION,
    codeVersion: CODE_VERSION,
    modelConfig: input.modelConfig,
    processingMode,
    privacyAckVersion: processingMode === 'INFERENCE_ENABLED' ? PRIVACY_ACK_VERSION : null,
    entitlement: { plan: 'pilot', maxSources, maxContentLength: maxContent },
    retentionClass: RETENTION_CLASS,
    requiredApprovals: [],
    createdAt: new Date().toISOString(),
  }
  return { manifest, digest: contentHash(manifest), requestId, processingMode }
}

export function verifyAdmissionManifest(run: { admissionManifest: unknown; admissionDigest: string | null }): void {
  if (!run.admissionDigest) throw new Error('Admission manifest is missing.')
  if (contentHash(run.admissionManifest) !== run.admissionDigest) {
    throw new Error('Admission manifest failed integrity verification.')
  }
}

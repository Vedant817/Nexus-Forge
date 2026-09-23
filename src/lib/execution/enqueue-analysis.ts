import { JobKind, type Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import config from '@/lib/config/env'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { contentHash } from './hash'
import { assertGroqModelAllowed } from './version-registry'
import { preflightAdmission } from '@/lib/execution/preflight'
import {
  ANALYSIS_STAGES,
  DEFAULT_MAX_ATTEMPTS,
  MODEL_CONFIG_VERSION,
  PIPELINE_VERSION,
  PROMPT_VERSION,
} from './constants'

export class ActiveAnalysisRunError extends Error {
  constructor(public readonly runId?: string) {
    super('An analysis run is already active for this project.')
    this.name = 'ActiveAnalysisRunError'
  }
}

export type EnqueuedAnalysis = { runId: string; status: 'QUEUED' }

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

export async function enqueueAnalysis(projectId: string, ownerId: string): Promise<EnqueuedAnalysis> {
  const project = await prisma.project.findUnique({
    where: { id: projectId, ownerId },
    include: { sources: { orderBy: { createdAt: 'asc' } } },
  })
  if (!project) throw new Error('Project not found')
  if (project.sources.length === 0 && !project.repoUrl) {
    throw new Error('Add at least one source or repo URL before running analysis')
  }
  if ((project.repoUrl || project.prUrl) && process.env.NODE_ENV === 'production' && (
    project.githubBindingStatus !== 'active' || !project.githubInstallationId || !project.githubRepositoryId
  )) {
    throw new Error('Connect the repository through the GitHub App before running analysis.')
  }

  // The snapshot is immutable and secret-redacted before being duplicated into run history.
  const inputSnapshot = {
    project: {
      name: redactSecrets(project.name),
      goal: redactSecrets(project.goal),
      repoUrl: redactSecrets(project.repoUrl),
      prUrl: redactSecrets(project.prUrl),
      githubRepositoryFullName: project.githubRepositoryFullName ?? null,
      githubRepositoryId: project.githubRepositoryId ?? null,
      githubInstallationId: project.githubInstallationId ?? null,
      githubBindingStatus: project.githubBindingStatus ?? 'unbound',
    },
    sources: project.sources.map((source) => ({
      id: source.id,
      type: redactSecrets(source.type),
      title: redactSecrets(source.title),
      content: redactSecrets(source.rawContent),
    })),
  }
  if (project.sources.some((source) => source.quarantineStatus === 'QUARANTINED')) {
    throw new Error('A quarantined source must be resolved or overridden before running analysis.')
  }
  // Defense in depth: re-scan at admission so rows stored before enforcement cannot reach the model.
  // Valid audited overrides are honored: the override is keyed by content hash, so
  // edited content misses the lookup and is re-quarantined instead of slipping through.
  const { assessUntrustedContent, SECRET_SCANNER_VERSION: SCANNER_VERSION } = await import('@/lib/security/secret-scanner')
  const { contentHash: sourceHash } = await import('@/lib/execution/hash')
  for (const source of project.sources) {
    const assessment = assessUntrustedContent(source.rawContent, source.title || source.type)
    if (!assessment.quarantined) continue
    if (source.quarantineStatus === 'OVERRIDDEN') {
      const override = await prisma.secretOverride.findUnique({
        where: { projectId_contentHash: { projectId, contentHash: sourceHash(source.rawContent) } },
      })
      if (override && (!override.expiresAt || override.expiresAt.getTime() > Date.now())) continue
    }
    await prisma.source.update({
      where: { id: source.id },
      data: {
        quarantineStatus: 'QUARANTINED',
        quarantineReason: assessment.reasons.join(',').slice(0, 500),
        scannerVersion: SCANNER_VERSION,
      },
    })
    throw new Error('A source failed admission scanning and was quarantined. Resolve or override it before running analysis.')
  }
  const inputHash = contentHash(inputSnapshot)
  const { getEffectiveEntitlement, assertEntitlementActive, reserveRunUsage } = await import('@/lib/billing/entitlements')
  const entitlement = await getEffectiveEntitlement({ organizationId: project.organizationId, userId: ownerId })
  assertEntitlementActive(entitlement)
  const latestProfile = await prisma.profileRevision.findFirst({ where: { projectId }, orderBy: { version: 'desc' } })
  const { PRESET_CONTROLS } = await import('@/lib/pilot/profiles')
  const profile = latestProfile
    ? { preset: latestProfile.preset, version: latestProfile.version, controls: latestProfile.controls as { maxSources: number; maxContentLength: number; maxFiles: number; includePRChecks: boolean; verbosity: string } }
    : { preset: 'Standard', version: 0, controls: PRESET_CONTROLS.Standard }
  const preflightProject = {
    ...project,
    repoUrl: inputSnapshot.project.repoUrl,
    prUrl: inputSnapshot.project.prUrl,
    sources: project.sources.map((source) => ({ id: source.id, type: source.type, title: source.title, content: source.rawContent })),
  }
  const preflight = preflightAdmission({
    project: preflightProject,
    actorId: ownerId,
    inputSnapshot,
    inputHash,
    modelConfig: { provider: 'groq', model: config.GROQ_MODEL },
    entitlement,
    profile,
  })
  const processingMode = preflight.processingMode
  const inferenceEnabled = processingMode === 'INFERENCE_ENABLED'
  if (inferenceEnabled) assertGroqModelAllowed(config.GROQ_MODEL)
  const modelConfig = inferenceEnabled ? { provider: 'groq', model: config.GROQ_MODEL } : { provider: 'none', model: 'deterministic-only' }
  const { manifest, digest } = (() => {
    const resolved = preflightAdmission({
      project: preflightProject,
      actorId: ownerId,
      inputSnapshot,
      inputHash,
      modelConfig,
      entitlement,
      profile,
    })
    return { manifest: resolved.manifest, digest: resolved.digest }
  })()

  try {
    const run = await prisma.$transaction(async (tx) => {
      await reserveRunUsage(tx, { organizationId: entitlement.organizationId, userId: ownerId, maxRunsPerDay: entitlement.maxRunsPerDay })
      const created = await tx.analysisRun.create({
        data: {
          projectId,
          ownerId,
          inputSnapshot,
          inputHash,
          pipelineVersion: PIPELINE_VERSION,
          promptVersion: PROMPT_VERSION,
          modelConfigVersion: inferenceEnabled ? MODEL_CONFIG_VERSION : 'deterministic-v1',
          modelConfig,
          processingMode,
          inferenceStatus: inferenceEnabled ? 'PENDING' : 'NOT_REQUESTED',
          admissionManifest: manifest as Prisma.InputJsonValue,
          admissionDigest: digest,
          stages: inferenceEnabled
            ? { create: ANALYSIS_STAGES.map((stage, ordinal) => ({ stage, ordinal })) }
            : undefined,
        },
        select: { id: true },
      })
      await tx.job.create({
        data: {
          kind: JobKind.ANALYSIS,
          projectId,
          ownerId,
          analysisRunId: created.id,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
        },
      })
      await tx.project.update({ where: { id: projectId, ownerId }, data: { status: 'queued' } })
      return created
    })
    return { runId: run.id, status: 'QUEUED' }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const active = await prisma.analysisRun.findFirst({
        where: { projectId, status: { in: ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'] } },
        select: { id: true },
      })
      throw new ActiveAnalysisRunError(active?.id)
    }
    throw error
  }
}

import { JobKind } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import config from '@/lib/config/env'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { contentHash } from './hash'
import { assertGroqModelAllowed } from './version-registry'
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
  assertGroqModelAllowed(config.GROQ_MODEL)
  const modelConfig = { provider: 'groq', model: config.GROQ_MODEL }

  try {
    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.analysisRun.create({
        data: {
          projectId,
          ownerId,
          inputSnapshot,
          inputHash: contentHash(inputSnapshot),
          pipelineVersion: PIPELINE_VERSION,
          promptVersion: PROMPT_VERSION,
          modelConfigVersion: MODEL_CONFIG_VERSION,
          modelConfig,
          stages: {
            create: ANALYSIS_STAGES.map((stage, ordinal) => ({ stage, ordinal })),
          },
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

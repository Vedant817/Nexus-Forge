/**
 * Lemma SDK Adapter Layer
 *
 * This module provides clean interfaces that mirror Lemma SDK concepts:
 * - Datastore: structured data storage
 * - Document Store: unstructured content storage
 * - Agent Runner: run AI agents with structured outputs
 * - Workflow Runner: orchestrate multi-step workflows
 *
 * When the real Lemma SDK is available, replace these implementations
 * with the actual SDK while keeping the same interfaces.
 */

import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import type {
  KnowledgeDistillerInput,
  KnowledgeDistillerOutput,
  RepoContextAgentInput,
  RepoContextAgentOutput,
  WorkflowPlannerInput,
  WorkflowPlannerOutput,
  ReleaseReadinessInput,
  ReleaseReadinessOutput,
  ProofOfWorkInput,
  ProofOfWorkOutput,
} from '@/types'

export interface DatastoreAdapter {
  getProject(id: string): Promise<any>
  createProject(data: any): Promise<any>
  updateProject(id: string, data: any): Promise<any>
  deleteProject(id: string): Promise<void>
  listProjects(): Promise<any[]>
}

export class PrismaDatastore implements DatastoreAdapter {
  async getProject(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: { sources: true },
    })
  }

  async createProject(data: { name: string; goal?: string; repoUrl?: string; prUrl?: string }) {
    return prisma.project.create({ data })
  }

  async updateProject(id: string, data: any) {
    return prisma.project.update({ where: { id }, data })
  }

  async deleteProject(id: string) {
    await prisma.project.delete({ where: { id } })
  }

  async listProjects() {
    return prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { sources: true } },
      },
    })
  }
}

export interface DocumentStoreAdapter {
  store(id: string, content: string, metadata?: Record<string, string>): Promise<void>
  get(id: string): Promise<string | null>
  delete(id: string): Promise<void>
  list(): Promise<string[]>
}

export class PrismaDocumentStore implements DocumentStoreAdapter {
  async store(id: string, content: string, metadata?: Record<string, string>) {
    if (metadata?.projectId) {
      await prisma.source.upsert({
        where: { id },
        create: {
          id,
          projectId: metadata.projectId,
          type: metadata.type || 'docs',
          title: metadata.title || '',
          rawContent: content,
          documentId: id,
        },
        update: {
          rawContent: content,
          title: metadata?.title ?? undefined,
        },
      })
    }
  }

  async get(id: string): Promise<string | null> {
    const source = await prisma.source.findUnique({ where: { id } })
    return source?.rawContent ?? null
  }

  async delete(id: string) {
    await prisma.source.delete({ where: { id } }).catch(() => { })
  }

  async list(): Promise<string[]> {
    const sources = await prisma.source.findMany({ select: { id: true } })
    return sources.map(s => s.id)
  }
}

export class InMemoryDocumentStore implements DocumentStoreAdapter {
  private _store = new Map<string, string>()

  async store(id: string, content: string, _metadata?: Record<string, string>) {
    this._store.set(id, content)
  }

  async get(id: string) {
    return this._store.get(id) ?? null
  }

  async delete(id: string) {
    this._store.delete(id)
  }

  async list() {
    return Array.from(this._store.keys())
  }
}

export interface AgentRunnerAdapter {
  runKnowledgeDistiller(input: KnowledgeDistillerInput): Promise<KnowledgeDistillerOutput>
  runRepoContextAgent(input: RepoContextAgentInput): Promise<RepoContextAgentOutput>
  runWorkflowPlanner(input: WorkflowPlannerInput): Promise<WorkflowPlannerOutput>
  runReleaseReadiness(input: ReleaseReadinessInput): Promise<ReleaseReadinessOutput>
  runProofOfWork(input: ProofOfWorkInput): Promise<ProofOfWorkOutput>
}

function validateOrThrow<T>(label: string, schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Agent output validation failed for ${label}: ${issues}`)
  }
  return result.data
}

export class LocalAgentRunner implements AgentRunnerAdapter {
  async runKnowledgeDistiller(input: KnowledgeDistillerInput): Promise<KnowledgeDistillerOutput> {
    const { knowledgeDistiller } = await import('@/lib/agents/knowledge-distiller')
    const { knowledgeDistillerOutputSchema } = await import('@/lib/agents/agent-schemas')
    const output = await knowledgeDistiller(input)
    return validateOrThrow('KnowledgeDistiller', knowledgeDistillerOutputSchema, output)
  }

  async runRepoContextAgent(input: RepoContextAgentInput): Promise<RepoContextAgentOutput> {
    const { repoContextAgent } = await import('@/lib/agents/repo-context-agent')
    const { repoContextAgentOutputSchema } = await import('@/lib/agents/agent-schemas')
    const output = await repoContextAgent(input)
    return validateOrThrow('RepoContextAgent', repoContextAgentOutputSchema, output)
  }

  async runWorkflowPlanner(input: WorkflowPlannerInput): Promise<WorkflowPlannerOutput> {
    const { workflowPlanner } = await import('@/lib/agents/workflow-planner')
    const { workflowPlannerOutputSchema } = await import('@/lib/agents/agent-schemas')
    const output = await workflowPlanner(input)
    return validateOrThrow('WorkflowPlanner', workflowPlannerOutputSchema, output)
  }

  async runReleaseReadiness(input: ReleaseReadinessInput): Promise<ReleaseReadinessOutput> {
    const { releaseReadinessAgent } = await import('@/lib/agents/release-readiness-agent')
    const { releaseReadinessOutputSchema } = await import('@/lib/agents/agent-schemas')
    const output = await releaseReadinessAgent(input)
    return validateOrThrow('ReleaseReadiness', releaseReadinessOutputSchema, output)
  }

  async runProofOfWork(input: ProofOfWorkInput): Promise<ProofOfWorkOutput> {
    const { proofOfWorkAgent } = await import('@/lib/agents/proof-of-work-agent')
    const { proofOfWorkOutputSchema } = await import('@/lib/agents/agent-schemas')
    const output = await proofOfWorkAgent(input)
    return validateOrThrow('ProofOfWork', proofOfWorkOutputSchema, output)
  }
}

let _datastore: DatastoreAdapter | null = null
let _documentStore: DocumentStoreAdapter | null = null
let _agentRunner: AgentRunnerAdapter | null = null

export function getDatastore(): DatastoreAdapter {
  if (!_datastore) _datastore = new PrismaDatastore()
  return _datastore
}

export function getDocumentStore(): DocumentStoreAdapter {
  if (!_documentStore) _documentStore = new PrismaDocumentStore()
  return _documentStore
}

export function getAgentRunner(): AgentRunnerAdapter {
  if (!_agentRunner) _agentRunner = new LocalAgentRunner()
  return _agentRunner
}

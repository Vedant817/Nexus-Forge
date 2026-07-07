import { z } from 'zod'
import { LemmaClient, setTestingToken, sleep, ResourceVisibility } from 'lemma-sdk'
import prisma from '@/lib/db/prisma'
import config from '@/lib/config/env'
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

const AGENTS_CONFIG: { name: string; instruction: string }[] = [
  {
    name: 'knowledge-distiller',
    instruction: `You are a Knowledge Distiller AI. Given learning sources (transcripts, blogs, docs, agent logs), extract:
- Main topic
- Key concepts (technical terms, frameworks, methodologies)
- Implementation patterns (architecture, design patterns)
- Buildable tasks (actionable items with titles, descriptions, and source evidence)
- Terms to understand
- Warnings or pitfalls
Return output as valid JSON.`,
  },
  {
    name: 'repo-context-agent',
    instruction: `You are a Repository Context Analyzer. Given a GitHub repo's README, folder tree, package.json, Dockerfile, CI config, and env example:
- Detect the technology stack
- Assess maturity (README quality, tests, CI/CD, Docker, env setup)
- Identify missing items (README, .env.example, Dockerfile, CI)
- Flag risks
- Suggest architecture summary
Return output as valid JSON.`,
  },
  {
    name: 'workflow-planner',
    instruction: `You are a Workflow Planner AI. Given a project goal, knowledge summary, and repo analysis:
- Generate a workflow title and objective
- Create a prioritized list of build tasks (with IDs, titles, descriptions, priority, acceptance criteria, suggested agent prompts)
- Generate acceptance criteria and test plan
- List expected files to change
Return output as valid JSON.`,
  },
  {
    name: 'release-readiness',
    instruction: `You are a Release Readiness Reviewer. Given a PR diff and changed files:
- Identify risks (hardcoded secrets, console.log, TODOs, ts-ignore)
- Detect missing tests
- Check for backward compatibility issues
- Check config/environment issues
- Generate release checklist and release notes
- Score release readiness
Return output as valid JSON.`,
  },
  {
    name: 'proof-of-work',
    instruction: `You are a Proof of Work Generator. Given the project goal, workflow output, repo analysis, and release report:
- Generate a portfolio summary
- Write a resume bullet point
- Create a demo video script
- Write an interview explanation
- Draft a LinkedIn post
- Score the proof quality
Return output as valid JSON.`,
  },
]

let _lemmaClient: LemmaClient | null = null
let _agentsInitialized = false

async function ensureLemmaAgents(client: LemmaClient): Promise<void> {
  if (_agentsInitialized) return
  _agentsInitialized = true

  for (const cfg of AGENTS_CONFIG) {
    try {
      await client.agents.get(cfg.name)
    } catch {
      try {
        await client.agents.create({
          name: cfg.name,
          instruction: cfg.instruction,
          visibility: ResourceVisibility.POD,
        })
      } catch {
        // Agent creation failed — fall back to local execution
      }
    }
  }
}

function getLemmaClient(): LemmaClient | null {
  if (_lemmaClient) return _lemmaClient
  if (!config.LEMMA_API_KEY || !config.LEMMA_POD_ID) return null
  setTestingToken(config.LEMMA_API_KEY)
  _lemmaClient = new LemmaClient({
    apiUrl: config.LEMMA_BASE_URL,
    podId: config.LEMMA_POD_ID,
  })
  ensureLemmaAgents(_lemmaClient)
  return _lemmaClient
}

export interface DatastoreAdapter {
  getProject(id: string): Promise<Record<string, unknown> | null>
  createProject(data: Record<string, unknown>): Promise<Record<string, unknown>>
  updateProject(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  deleteProject(id: string): Promise<void>
  listProjects(): Promise<Record<string, unknown>[]>
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

  async updateProject(id: string, data: Record<string, unknown>) {
    return prisma.project.update({ where: { id }, data: data as Record<string, unknown> })
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

export class LemmaDatastore implements DatastoreAdapter {
  private static readonly TABLE = 'projects'

  private get records() {
    const client = getLemmaClient()
    if (!client) throw new Error('Lemma SDK not configured — set LEMMA_API_KEY and LEMMA_POD_ID')
    return client.records
  }

  async getProject(id: string) {
    try {
      return await this.records.get(LemmaDatastore.TABLE, id)
    } catch {
      return null
    }
  }

  async createProject(data: Record<string, unknown>) {
    return this.records.create(LemmaDatastore.TABLE, { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as unknown as Record<string, unknown>
  }

  async updateProject(id: string, data: Record<string, unknown>) {
    return this.records.update(LemmaDatastore.TABLE, id, { ...data, updatedAt: new Date().toISOString() }) as unknown as Record<string, unknown>
  }

  async deleteProject(id: string) {
    await this.records.delete(LemmaDatastore.TABLE, id)
  }

  async listProjects() {
    const res = await this.records.list(LemmaDatastore.TABLE, { sort: [{ field: 'updatedAt', direction: 'desc' }] })
    return res.items || []
  }
}

export interface DocumentStoreAdapter {
  store(id: string, content: string, metadata?: Record<string, string>): Promise<void>
  get(id: string): Promise<string | null>
  delete(id: string): Promise<void>
  list(): Promise<string[]>
}

export class PrismaDocumentStore implements DocumentStoreAdapter {
  async store(id: string, content: string, _metadata?: Record<string, string>) {
    if (_metadata?.projectId) {
      await prisma.source.upsert({
        where: { id },
        create: {
          id,
          projectId: _metadata.projectId,
          type: _metadata.type || 'docs',
          title: _metadata.title || '',
          rawContent: content,
          documentId: id,
        },
        update: {
          rawContent: content,
          title: _metadata?.title ?? undefined,
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

export class LemmaDocumentStore implements DocumentStoreAdapter {
  private get files() {
    const client = getLemmaClient()
    if (!client) throw new Error('Lemma SDK not configured — set LEMMA_API_KEY and LEMMA_POD_ID')
    return client.files
  }

  async store(id: string, content: string, _metadata?: Record<string, string>) {
    const blob = new Blob([content], { type: 'text/plain' })
    await this.files.upload(blob, { name: `sources/${id}.txt` })
    
    // Also store metadata in Prisma so the source shows up in the UI
    if (_metadata?.projectId) {
      await prisma.source.upsert({
        where: { id },
        create: {
          id,
          projectId: _metadata.projectId,
          type: _metadata.type || 'docs',
          title: _metadata.title || '',
          rawContent: content.substring(0, 500) + '... (content stored in Lemma)',
          documentId: id,
        },
        update: {
          title: _metadata?.title ?? undefined,
        },
      })
    }
  }

  async get(id: string): Promise<string | null> {
    try {
      const blob = await this.files.download(`sources/${id}.txt`)
      return await blob.text()
    } catch {
      return null
    }
  }

  async delete(id: string) {
    await this.files.delete(`sources/${id}.txt`).catch(() => {})
  }

  async list(): Promise<string[]> {
    const res = await this.files.list({ directoryPath: 'sources' })
    if (!res.items) return []
    return res.items.map(f => f.name.replace('.txt', ''))
  }
}

export class InMemoryDocumentStore implements DocumentStoreAdapter {
  private _store = new Map<string, string>()

  async store(id: string, content: string, _metadata?: Record<string, string>) {
    void _metadata
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
  runQualityPlanner?(input: unknown): Promise<unknown>
  runQualityGenerator?(input: unknown): Promise<unknown>
  runQualityEvaluator?(input: unknown): Promise<unknown>
}

export function validateOrThrow<T>(label: string, schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Agent output validation failed for ${label}: ${issues}`)
  }
  return result.data
}

async function runAgentViaLemma<T>(agentName: string, input: unknown, schema: z.ZodSchema<T>): Promise<T> {
  const client = getLemmaClient()
  if (!client) throw new Error('Lemma SDK not configured')

  const jsonInput = JSON.stringify(input)

  const result = await client.agents.run(agentName, jsonInput, { stream: false })
  if (!result || !('id' in (result as Record<string, unknown>))) {
    throw new Error('Lemma agent returned unexpected response type')
  }
  const conversation = result as unknown as import('lemma-sdk').Conversation

  const maxRetries = 30
  for (let i = 0; i < maxRetries; i++) {
    const page = await client.conversations.messages.list(conversation.id)
    const assistantMessages = page.items.filter(m => m.role === 'assistant' && m.text)
    if (assistantMessages.length > 0) {
      const outputText = assistantMessages[assistantMessages.length - 1].text || ''
      let parsed: unknown
      try {
        parsed = JSON.parse(outputText)
      } catch {
        parsed = { raw: outputText }
      }
      return validateOrThrow(agentName, schema, parsed)
    }
    await sleep(1000)
  }

  throw new Error(`Lemma agent ${agentName} did not respond within 30s timeout`)
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

  async runQualityPlanner() { throw new Error('Local Quality Planner not implemented') }
  async runQualityGenerator() { throw new Error('Local Quality Generator not implemented') }
  async runQualityEvaluator() { throw new Error('Local Quality Evaluator not implemented') }
}

export class LemmaAgentRunner implements AgentRunnerAdapter {
  async runKnowledgeDistiller(input: KnowledgeDistillerInput): Promise<KnowledgeDistillerOutput> {
    const { knowledgeDistillerOutputSchema } = await import('@/lib/agents/agent-schemas')
    return runAgentViaLemma('knowledge-distiller', input, knowledgeDistillerOutputSchema)
  }

  async runRepoContextAgent(input: RepoContextAgentInput): Promise<RepoContextAgentOutput> {
    const { repoContextAgentOutputSchema } = await import('@/lib/agents/agent-schemas')
    return runAgentViaLemma('repo-context-agent', input, repoContextAgentOutputSchema)
  }

  async runWorkflowPlanner(input: WorkflowPlannerInput): Promise<WorkflowPlannerOutput> {
    const { workflowPlannerOutputSchema } = await import('@/lib/agents/agent-schemas')
    return runAgentViaLemma('workflow-planner', input, workflowPlannerOutputSchema)
  }

  async runReleaseReadiness(input: ReleaseReadinessInput): Promise<ReleaseReadinessOutput> {
    const { releaseReadinessOutputSchema } = await import('@/lib/agents/agent-schemas')
    return runAgentViaLemma('release-readiness', input, releaseReadinessOutputSchema)
  }

  async runProofOfWork(input: ProofOfWorkInput): Promise<ProofOfWorkOutput> {
    const { proofOfWorkOutputSchema } = await import('@/lib/agents/agent-schemas')
    return runAgentViaLemma('proof-of-work', input, proofOfWorkOutputSchema)
  }

  async runQualityPlanner(input: unknown): Promise<unknown> {
    const { qualityPlannerOutputSchema } = await import('@/lib/agents/quality-agent-schemas')
    return runAgentViaLemma('quality-planner', input, qualityPlannerOutputSchema)
  }

  async runQualityGenerator(input: unknown): Promise<unknown> {
    const { qualityGeneratorOutputSchema } = await import('@/lib/agents/quality-agent-schemas')
    return runAgentViaLemma('quality-generator', input, qualityGeneratorOutputSchema)
  }

  async runQualityEvaluator(input: unknown): Promise<unknown> {
    const { qualityEvaluatorOutputSchema } = await import('@/lib/agents/quality-agent-schemas')
    return runAgentViaLemma('quality-evaluator', input, qualityEvaluatorOutputSchema)
  }
}

let _datastore: DatastoreAdapter | null = null
let _documentStore: DocumentStoreAdapter | null = null
let _agentRunner: AgentRunnerAdapter | null = null

export function getDatastore(): DatastoreAdapter {
  if (_datastore) return _datastore
  if (getLemmaClient()) {
    _datastore = new LemmaDatastore()
  } else {
    _datastore = new PrismaDatastore()
  }
  return _datastore
}

export function getDocumentStore(): DocumentStoreAdapter {
  if (_documentStore) return _documentStore
  if (getLemmaClient()) {
    _documentStore = new LemmaDocumentStore()
  } else {
    _documentStore = new PrismaDocumentStore()
  }
  return _documentStore
}

export async function getAgentRunner(): Promise<AgentRunnerAdapter> {
  if (_agentRunner) return _agentRunner
  if (getLemmaClient()) {
    _agentRunner = new LemmaAgentRunner()
  } else if (config.GROQ_API_KEY) {
    const { GroqAgentRunner } = await import('./groq-runner')
    _agentRunner = new GroqAgentRunner() as AgentRunnerAdapter
  } else {
    _agentRunner = new LocalAgentRunner()
  }
  return _agentRunner
}

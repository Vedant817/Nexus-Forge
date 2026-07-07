import { z } from 'zod'
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
import type { AgentRunnerAdapter } from './lemma-client'
import { validateOrThrow } from './lemma-client'

const AGENT_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  'knowledge-distiller': `You are a Knowledge Distiller AI. Given learning sources (transcripts, blogs, docs, agent logs), extract:
- Main topic
- Key concepts (technical terms, frameworks, methodologies)
- Implementation patterns (architecture, design patterns)
- Buildable tasks (actionable items with titles, descriptions, and source evidence)
- Terms to understand
- Warnings or pitfalls
Return output as valid JSON.`,

  'repo-context-agent': `You are a Repository Context Analyzer. Given a GitHub repo's README, folder tree, package.json, Dockerfile, CI config, and env example:
- Detect the technology stack
- Assess maturity (README quality, tests, CI/CD, Docker, env setup)
- Identify missing items (README, .env.example, Dockerfile, CI)
- Flag risks
- Suggest architecture summary
Return output as valid JSON.`,

  'workflow-planner': `You are a Workflow Planner AI. Given a project goal, knowledge summary, and repo analysis:
- Generate a workflow title and objective
- Create a prioritized list of build tasks (with IDs, titles, descriptions, priority, acceptance criteria, suggested agent prompts)
- Generate acceptance criteria and test plan
- List expected files to change
Return output as valid JSON.`,

  'release-readiness': `You are a Release Readiness Reviewer. Given a PR diff and changed files:
- Identify risks (hardcoded secrets, console.log, TODOs, ts-ignore)
- Detect missing tests
- Check for backward compatibility issues
- Check config/environment issues
- Generate release checklist and release notes
- Score release readiness
Return output as valid JSON.`,

  'proof-of-work': `You are a Proof of Work Generator. Given the project goal, workflow output, repo analysis, and release report:
- Generate a portfolio summary
- Write a resume bullet point
- Create a demo video script
- Write an interview explanation
- Draft a LinkedIn post
- Score the proof quality
Return output as valid JSON.`,

  'quality-planner': `You are a Quality Planner. Given a project improvement goal, analyze the current state and produce a spec.
1. Expand the short goal into a detailed objective
2. Assess current quality state (build, tests, lint, typecheck, security)
3. Break the work into discrete units, each one file-change-sized
4. Choose which quality criteria to enforce
Return valid JSON matching the schema.`,

  'quality-generator': `You are a Quality Generator. Implement one unit of work from the improvement spec.
Given a unit description and acceptance criteria, propose precise file edits using the edit tool format (oldString → newString). Each edit must:
1. Be minimal and targeted — only change what's needed
2. Preserve all existing code style and conventions
3. Include exact surrounding context for the oldString match
4. Be safe to apply automatically
Return valid JSON matching the schema with an array of edits.`,

  'quality-evaluator': `You are a Quality Evaluator for the Hermes Forge self-improvement loop.
Review the runner results and provide:
1. A detailed analysis of what failed and why
2. Specific, actionable rework instructions for each failure
3. A pass/fail decision based on the criteria
Return valid JSON matching the quality evaluator output schema with an additional "analysis" field.`,
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenRouterResponse {
  choices: { message: { content: string } }[]
}

async function runAgentViaOpenRouter<T>(
  agentName: string,
  systemInstruction: string,
  input: unknown,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const apiKey = config.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OpenRouter API key not configured — set OPENROUTER_API_KEY')

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: JSON.stringify(input, null, 2) },
  ]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://hermes-forge.app',
      'X-Title': 'Hermes Forge',
    },
    body: JSON.stringify({
      model: config.OPENROUTER_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenRouter API error ${res.status}: ${body}`)
  }

  const data: OpenRouterResponse = await res.json()
  const outputText = data.choices?.[0]?.message?.content || ''

  let parsed: unknown
  try {
    parsed = JSON.parse(outputText)
  } catch {
    parsed = { raw: outputText }
  }

  return validateOrThrow(agentName, schema, parsed)
}

function makeRunner(agentName: string): <T>(input: unknown, schema: z.ZodSchema<T>) => Promise<T> {
  const instruction = AGENT_SYSTEM_INSTRUCTIONS[agentName]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (input, schema) => runAgentViaOpenRouter(agentName, instruction, input, schema) as Promise<any>
}

export class OpenRouterAgentRunner implements AgentRunnerAdapter {
  async runKnowledgeDistiller(input: KnowledgeDistillerInput): Promise<KnowledgeDistillerOutput> {
    const { knowledgeDistillerOutputSchema } = await import('@/lib/agents/agent-schemas')
    return makeRunner('knowledge-distiller')(input, knowledgeDistillerOutputSchema)
  }

  async runRepoContextAgent(input: RepoContextAgentInput): Promise<RepoContextAgentOutput> {
    const { repoContextAgentOutputSchema } = await import('@/lib/agents/agent-schemas')
    return makeRunner('repo-context-agent')(input, repoContextAgentOutputSchema)
  }

  async runWorkflowPlanner(input: WorkflowPlannerInput): Promise<WorkflowPlannerOutput> {
    const { workflowPlannerOutputSchema } = await import('@/lib/agents/agent-schemas')
    return makeRunner('workflow-planner')(input, workflowPlannerOutputSchema)
  }

  async runReleaseReadiness(input: ReleaseReadinessInput): Promise<ReleaseReadinessOutput> {
    const { releaseReadinessOutputSchema } = await import('@/lib/agents/agent-schemas')
    return makeRunner('release-readiness')(input, releaseReadinessOutputSchema)
  }

  async runProofOfWork(input: ProofOfWorkInput): Promise<ProofOfWorkOutput> {
    const { proofOfWorkOutputSchema } = await import('@/lib/agents/agent-schemas')
    return makeRunner('proof-of-work')(input, proofOfWorkOutputSchema)
  }

  async runQualityPlanner(input: unknown): Promise<unknown> {
    const { qualityPlannerOutputSchema } = await import('@/lib/agents/quality-agent-schemas')
    return makeRunner('quality-planner')(input, qualityPlannerOutputSchema)
  }

  async runQualityGenerator(input: unknown): Promise<unknown> {
    const { qualityGeneratorOutputSchema } = await import('@/lib/agents/quality-agent-schemas')
    return makeRunner('quality-generator')(input, qualityGeneratorOutputSchema)
  }

  async runQualityEvaluator(input: unknown): Promise<unknown> {
    const { qualityEvaluatorOutputSchema } = await import('@/lib/agents/quality-agent-schemas')
    return makeRunner('quality-evaluator')(input, qualityEvaluatorOutputSchema)
  }
}

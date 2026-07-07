import { z } from 'zod'
import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import zodToJsonSchema from 'zod-to-json-schema'
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

const AGENT_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  'knowledge-distiller': `You are a Knowledge Distiller AI. Given learning sources (transcripts, blogs, docs, agent logs), extract the requested information into a JSON object with EXACTLY these keys:
- mainTopic (string): The primary subject.
- keyConcepts (array of strings): Technical terms, frameworks, methodologies.
- implementationPatterns (array of strings): Architecture, design patterns.
- buildableTasks (array of objects): Actionable items. Each object must have: title (string), description (string), evidence (string).
- warningsOrPitfalls (array of strings): Things to watch out for.
- termsToUnderstand (array of strings): Vocabulary.
- sourceEvidence (array of strings): Quotes from the text.
- recommendedNextAction (string): Next step.`,

  'repo-context-agent': `You are a Repository Context Analyzer. Given a GitHub repo's files, analyze the repository into a JSON object with EXACTLY these keys:
- detectedStack (array of strings): Tech stack.
- architectureSummary (string): Architecture overview.
- importantFiles (array of strings): Key files.
- likelyFeatureLocations (array of strings): Where features are.
- testLocations (array of strings): Where tests are.
- setupQuality (string): Quality of setup.
- missingItems (array of strings): Missing files.
- risks (array of strings): Potential risks.
- maturityScore (number): 0-100 score.
- recommendedFixes (array of strings): Suggested improvements.`,

  'workflow-planner': `You are a Workflow Planner AI. Given a project goal, knowledge, and repo analysis, generate a workflow plan JSON object with EXACTLY these keys:
- workflowTitle (string): Title.
- objective (string): Goal.
- tasks (array of objects): Each object must have: id (string), title (string), description (string), status (must be exactly 'planned' | 'in_progress' | 'needs_review' | 'done'), priority (must be exactly 'low' | 'medium' | 'high' | 'critical'), reason (string), acceptanceCriteria (array of strings), suggestedAgentPrompt (string), evidence (array of strings).
- acceptanceCriteria (array of strings): Overall criteria.
- testPlan (string): Testing plan.
- suggestedAgentPrompts (array of strings): Prompts.
- expectedFilesToChange (array of strings): Files.
- reviewChecklist (array of strings): Checklist.`,

  'release-readiness': `You are a Release Readiness Reviewer. Given a PR diff, perform a release readiness review into a JSON object with EXACTLY these keys:
- releaseScore (number): 0-100 score.
- decision (string): Must be 'go' | 'go_with_fixes' | 'no_go'.
- topRisks (array of strings): Risks.
- missingTests (array of strings): Tests.
- missingDocs (array of strings): Docs.
- configOrEnvIssues (array of strings): Env issues.
- backwardCompatibilityConcerns (array of strings): BC issues.
- releaseChecklist (array of strings): Checklist.
- releaseNotesDraft (string): Notes.
- recommendedFixesBeforeMerge (array of strings): Fixes.`,

  'proof-of-work': `You are a Proof of Work Generator. Given project info, generate materials into a JSON object with EXACTLY these keys:
- portfolioSummary (string): Summary.
- resumeBullet (string): Bullet.
- demoVideoScript (string): Script.
- interviewExplanation (string): Explanation.
- linkedinPost (string): Post.
- proofScore (number): 0-100 score.
- missingProofItems (array of strings): Missing items.`,

  'quality-planner': `You are a Quality Planner. Produce a spec.`,
  'quality-generator': `You are a Quality Generator. Propose edits.`,
  'quality-evaluator': `You are a Quality Evaluator. Review results.`,
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

export async function runAgentViaAiSdk<T>(
  systemInstruction: string,
  input: any,
  schema: z.ZodSchema<T>
): Promise<T> {
  const apiKey = config.GROQ_API_KEY
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in environment variables.")
  }
  
  const groq = createGroq({ apiKey })
  const jsonSchema = zodToJsonSchema(schema as any)

  const fullInstruction = systemInstruction + 
    '\\n\\nYou MUST return your response as a valid JSON object matching the following JSON Schema:\\n' +
    JSON.stringify(jsonSchema, null, 2) +
    '\\n\\nCRITICAL INSTRUCTION: You must strictly adhere to the exact property names and types defined in the JSON Schema above.\\n1. Use camelCase keys exactly as they appear in the schema. Do NOT output snake_case keys.\\n2. If a field is an array (e.g. array of strings), you MUST return a valid JSON array `[]`, not a single string.\\n3. If a field has an `enum` constraint, you MUST use one of the exact string values listed in the enum array.\\n4. Only output the valid JSON object without markdown blocks or backticks. DO NOT output {"schema": ..., "extractedData": ...}. Just output the object directly matching the schema.'

  const { text } = await generateText({
    model: groq(config.GROQ_MODEL),
    system: fullInstruction,
    prompt: "Here is the input data:\\n" + JSON.stringify(input, null, 2) + "\\n\\nNow, generate the JSON output based on the instructions.",
  })

  try {
    let jsonStr = text.trim()
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(jsonStr)
    return schema.parse(parsed)
  } catch (err) {
    console.error("Failed to parse or validate JSON from LLM:\\n", text)
    throw err
  }
}

function makeRunner(agentName: string): <T>(input: unknown, schema: z.ZodSchema<T>) => Promise<T> {
  const instruction = AGENT_SYSTEM_INSTRUCTIONS[agentName]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (input, schema) => runAgentViaAiSdk(instruction, input, schema) as Promise<any>
}

export class VercelAiAgentRunner implements AgentRunnerAdapter {
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

// Singleton for export
let _agentRunner: AgentRunnerAdapter | null = null

export function getAgentRunner(): AgentRunnerAdapter {
  if (!_agentRunner) {
    _agentRunner = new VercelAiAgentRunner()
  }
  return _agentRunner
}

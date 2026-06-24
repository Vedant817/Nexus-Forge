import type { Project, Source, KnowledgeSummary, RepoAnalysis, Workflow, ReleaseReport, ProofPack } from '@prisma/client'

export type ProjectStatus = 'idle' | 'has_sources' | 'analyzing' | 'completed' | 'error'

export type SourceType = 'transcript' | 'blog' | 'notes' | 'agent_log' | 'docs' | 'file'

export type ReleaseDecision = 'go' | 'go_with_fixes' | 'no_go'

export interface KnowledgeDistillerInput {
  sources: { type: string; title: string; content: string }[]
}

export interface KnowledgeDistillerOutput {
  mainTopic: string
  keyConcepts: string[]
  implementationPatterns: string[]
  buildableTasks: { title: string; description: string; evidence: string }[]
  warningsOrPitfalls: string[]
  termsToUnderstand: string[]
  sourceEvidence: string[]
  recommendedNextAction: string
}

export interface RepoContextAgentInput {
  repoUrl: string
  readme?: string
  folderTree?: string
  packageJson?: string
  requirementsTxt?: string
  pyprojectToml?: string
  dockerfile?: string
  dockerCompose?: string
  githubWorkflows?: string[]
  envExample?: string
}

export interface RepoContextAgentOutput {
  detectedStack: string[]
  architectureSummary: string
  importantFiles: string[]
  likelyFeatureLocations: string[]
  testLocations: string[]
  setupQuality: string
  missingItems: string[]
  risks: string[]
  maturityScore: number
  recommendedFixes: string[]
}

export interface WorkflowPlannerInput {
  projectGoal: string
  knowledgeSummary: KnowledgeDistillerOutput
  repoAnalysis?: RepoContextAgentOutput
  agentLogFindings?: string
}

export interface WorkflowTask {
  id: string
  title: string
  description: string
  status: 'planned' | 'in_progress' | 'needs_review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  acceptanceCriteria: string[]
  suggestedAgentPrompt: string
  evidence: string[]
}

export interface WorkflowPlannerOutput {
  workflowTitle: string
  objective: string
  tasks: WorkflowTask[]
  acceptanceCriteria: string[]
  testPlan: string
  suggestedAgentPrompts: string[]
  expectedFilesToChange: string[]
  reviewChecklist: string[]
}

export interface ReleaseReadinessInput {
  prUrl?: string
  prDiff?: string
  changedFiles?: string[]
  workflowAcceptanceCriteria?: string[]
  repoAnalysis?: RepoContextAgentOutput
}

export interface ReleaseReadinessOutput {
  releaseScore: number
  decision: ReleaseDecision
  topRisks: string[]
  missingTests: string[]
  missingDocs: string[]
  configOrEnvIssues: string[]
  backwardCompatibilityConcerns: string[]
  releaseChecklist: string[]
  releaseNotesDraft: string
  recommendedFixesBeforeMerge: string[]
}

export interface ProofOfWorkInput {
  projectGoal: string
  workflowOutput: WorkflowPlannerOutput
  repoAnalysis?: RepoContextAgentOutput
  releaseReport?: ReleaseReadinessOutput
  finalSummary: string
}

export interface ProofOfWorkOutput {
  portfolioSummary: string
  resumeBullet: string
  demoVideoScript: string
  interviewExplanation: string
  linkedinPost: string
  proofScore: number
  missingProofItems: string[]
}

export interface PipelineResult {
  projectId: string
  knowledge?: KnowledgeDistillerOutput
  repoAnalysis?: RepoContextAgentOutput
  workflow?: WorkflowPlannerOutput
  releaseReport?: ReleaseReadinessOutput
  proofPack?: ProofOfWorkOutput
}

export interface ScoreBreakdown {
  score: number
  maxScore: number
  reasons: string[]
  positiveEvidence: string[]
  missingEvidence: string[]
  recommendedFixes: string[]
}

export type AnalysisStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed'

export interface ApiError {
  error: string
  details?: string
}

export interface ProjectWithDetails extends Project {
  sources: Source[]
  knowledge?: KnowledgeSummary | null
  repoAnalysis?: RepoAnalysis | null
  workflow?: Workflow | null
  releaseReport?: ReleaseReport | null
  proofPack?: ProofPack | null
}

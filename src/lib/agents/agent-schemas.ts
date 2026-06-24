import { z } from 'zod'

export const knowledgeDistillerOutputSchema = z.object({
  mainTopic: z.string(),
  keyConcepts: z.array(z.string()),
  implementationPatterns: z.array(z.string()),
  buildableTasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    evidence: z.string(),
  })),
  warningsOrPitfalls: z.array(z.string()),
  termsToUnderstand: z.array(z.string()),
  sourceEvidence: z.array(z.string()),
  recommendedNextAction: z.string(),
})

export const repoContextAgentOutputSchema = z.object({
  detectedStack: z.array(z.string()),
  architectureSummary: z.string(),
  importantFiles: z.array(z.string()),
  likelyFeatureLocations: z.array(z.string()),
  testLocations: z.array(z.string()),
  setupQuality: z.string(),
  missingItems: z.array(z.string()),
  risks: z.array(z.string()),
  maturityScore: z.number().int().min(0).max(100),
  recommendedFixes: z.array(z.string()),
})

export const workflowTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['planned', 'in_progress', 'needs_review', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  reason: z.string(),
  acceptanceCriteria: z.array(z.string()),
  suggestedAgentPrompt: z.string(),
  evidence: z.array(z.string()),
})

export const workflowPlannerOutputSchema = z.object({
  workflowTitle: z.string(),
  objective: z.string(),
  tasks: z.array(workflowTaskSchema),
  acceptanceCriteria: z.array(z.string()),
  testPlan: z.string(),
  suggestedAgentPrompts: z.array(z.string()),
  expectedFilesToChange: z.array(z.string()),
  reviewChecklist: z.array(z.string()),
})

export const releaseReadinessOutputSchema = z.object({
  releaseScore: z.number().int().min(0).max(100),
  decision: z.enum(['go', 'go_with_fixes', 'no_go']),
  topRisks: z.array(z.string()),
  missingTests: z.array(z.string()),
  missingDocs: z.array(z.string()),
  configOrEnvIssues: z.array(z.string()),
  backwardCompatibilityConcerns: z.array(z.string()),
  releaseChecklist: z.array(z.string()),
  releaseNotesDraft: z.string(),
  recommendedFixesBeforeMerge: z.array(z.string()),
})

export const proofOfWorkOutputSchema = z.object({
  portfolioSummary: z.string(),
  resumeBullet: z.string(),
  demoVideoScript: z.string(),
  interviewExplanation: z.string(),
  linkedinPost: z.string(),
  proofScore: z.number().int().min(0).max(100),
  missingProofItems: z.array(z.string()),
})

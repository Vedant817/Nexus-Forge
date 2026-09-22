import { z } from 'zod'

export const citationSchema = z.object({
  claim: z.string().min(1).max(500),
  evidenceIds: z.array(z.string().min(1).max(200)).max(20),
  limitations: z.string().max(500).default(''),
}).strict()

export const knowledgeDistillerOutputSchema = z.object({
  mainTopic: z.string().min(1).max(500),
  keyConcepts: z.array(z.string().min(1).max(300)).max(50),
  implementationPatterns: z.array(z.string().min(1).max(500)).max(50),
  buildableTasks: z.array(z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(5000),
    evidence: z.string().max(500),
    citations: z.array(citationSchema).max(10).default([]),
  }).strict()).max(50),
  warningsOrPitfalls: z.array(z.string().min(1).max(500)).max(50),
  termsToUnderstand: z.array(z.string().min(1).max(200)).max(50),
  sourceEvidence: z.array(z.string().min(1).max(200)).max(100),
  recommendedNextAction: z.string().max(2000),
  citations: z.array(citationSchema).max(20).default([]),
}).strict()

export const repoContextAgentOutputSchema = z.object({
  detectedStack: z.array(z.string().min(1).max(200)).max(50),
  architectureSummary: z.string().max(10000),
  importantFiles: z.array(z.string().min(1).max(500)).max(200),
  likelyFeatureLocations: z.array(z.string().min(1).max(500)).max(100),
  testLocations: z.array(z.string().min(1).max(500)).max(100),
  setupQuality: z.string().max(5000),
  missingItems: z.array(z.string().min(1).max(500)).max(100),
  risks: z.array(z.string().min(1).max(1000)).max(100),
  recommendedFixes: z.array(z.string().min(1).max(1000)).max(100),
  citations: z.array(citationSchema).max(20).default([]),
}).strict()

export const workflowTaskSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  description: z.string().max(10000),
  status: z.enum(['planned', 'in_progress', 'needs_review', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  reason: z.string().max(5000),
  acceptanceCriteria: z.array(z.string().min(1).max(2000)).max(50),
  suggestedAgentPrompt: z.string().max(20000),
  evidence: z.array(z.string().min(1).max(200)).max(100),
  citations: z.array(citationSchema).max(10).default([]),
}).strict()

export const workflowPlannerOutputSchema = z.object({
  workflowTitle: z.string().min(1).max(300),
  objective: z.string().max(5000),
  tasks: z.array(workflowTaskSchema).max(200),
  acceptanceCriteria: z.array(z.string().min(1).max(2000)).max(200),
  testPlan: z.string().max(10000),
  suggestedAgentPrompts: z.array(z.string().max(5000)).max(50),
  expectedFilesToChange: z.array(z.string().min(1).max(500)).max(500),
  reviewChecklist: z.array(z.string().min(1).max(1000)).max(200),
  citations: z.array(citationSchema).max(20).default([]),
}).strict()

export const releaseReadinessOutputSchema = z.object({
  topRisks: z.array(z.string().min(1).max(1000)).max(100),
  missingTests: z.array(z.string().min(1).max(1000)).max(100),
  missingDocs: z.array(z.string().min(1).max(1000)).max(100),
  configOrEnvIssues: z.array(z.string().min(1).max(1000)).max(100),
  backwardCompatibilityConcerns: z.array(z.string().min(1).max(1000)).max(100),
  releaseChecklist: z.array(z.string().min(1).max(1000)).max(200),
  releaseNotesDraft: z.string().max(20000),
  recommendedFixesBeforeMerge: z.array(z.string().min(1).max(1000)).max(100),
  citations: z.array(citationSchema).max(20).default([]),
}).strict()

export const proofOfWorkOutputSchema = z.object({
  portfolioSummary: z.string().max(20000),
  resumeBullet: z.string().max(2000),
  demoVideoScript: z.string().max(20000),
  interviewExplanation: z.string().max(20000),
  linkedinPost: z.string().max(5000),
  missingProofItems: z.array(z.string().min(1).max(1000)).max(100),
  citations: z.array(citationSchema).max(20).default([]),
}).strict()

import type { ProofOfWorkInput, ProofOfWorkOutput } from '@/types'
import { computeProofScore } from '@/lib/scoring/scoring'

export async function proofOfWorkAgent(input: ProofOfWorkInput): Promise<ProofOfWorkOutput> {
  const tasks = input.workflowOutput?.tasks || []
  const completedTasks = tasks.filter(t => t.status === 'done')
  const hasRepoAnalysis = !!input.repoAnalysis
  const hasReleaseReport = !!input.releaseReport
  const taskCount = tasks.length
  const completedCount = completedTasks.length

  const missingItems: string[] = []
  if (taskCount === 0) missingItems.push('No workflow tasks defined')
  if (!hasRepoAnalysis) missingItems.push('No repository analysis completed')
  if (!hasReleaseReport) missingItems.push('No release readiness report')
  if (completedCount === 0) missingItems.push('No completed tasks to demonstrate')

  const hasClearProblem = !!input.projectGoal && input.projectGoal.length > 10
  const hasWorkingEvidence = taskCount > 0
  const hasValidation = hasReleaseReport
  const hasGoodExplanation = !!input.finalSummary
  const hasPortfolioValue = hasRepoAnalysis && taskCount > 0

  const scoreResult = computeProofScore({
    hasClearProblem,
    hasWorkingEvidence,
    hasValidation,
    hasGoodExplanation,
    hasPortfolioValue,
  })

  return {
    portfolioSummary: generatePortfolioSummary(input),
    resumeBullet: generateResumeBullet(input),
    demoVideoScript: generateDemoScript(input),
    interviewExplanation: generateInterviewExplanation(input),
    linkedinPost: generateLinkedInPost(input),
    proofScore: scoreResult.score,
    missingProofItems: [...missingItems, ...scoreResult.missingEvidence],
  }
}

function generatePortfolioSummary(input: ProofOfWorkInput): string {
  const goal = input.projectGoal || 'an AI-native project'
  return `Built ${goal} as part of the Praxis Forge pipeline. The project combines learning from multiple sources with repository analysis to generate actionable build workflows, release-readiness reports, and proof-of-work documentation. This demonstrates end-to-end AI-assisted development from concept to review-ready output.`
}

function generateResumeBullet(input: ProofOfWorkInput): string {
  const goal = input.projectGoal || 'AI workflow automation'
  return `Built and shipped ${goal} using Praxis Forge — an AI-native workflow operator that ingests learning sources, analyzes repository readiness, generates executable build tasks with agent prompts, and produces portfolio-ready proof-of-work documentation.`
}

function generateDemoScript(input: ProofOfWorkInput): string {
  return `[00:00] Introduce the problem: ${input.projectGoal || 'Building with AI assistance'}
[00:15] Show the project intake — adding sources, repo URL, and AI agent logs
[00:30] Walk through the knowledge distillation results
[00:45] Review the repository analysis and maturity score
[01:00] Show the generated workflow board with tasks and agent prompts
[01:15] Review the release readiness report
[01:30] Export the proof pack as Markdown
[01:45] Summary and key takeaways`
}

function generateInterviewExplanation(input: ProofOfWorkInput): string {
  return `I built ${input.projectGoal || 'a project'} using Praxis Forge. The process started with ingesting learning content (transcripts, blogs, AI agent chats) and a GitHub repository URL. The system ran five AI agents: a knowledge distiller to extract key concepts, a repo context agent to analyze codebase maturity, a workflow planner to create executable tasks with copyable AI prompts, a release readiness agent to check for risks, and a proof-of-work agent to generate portfolio materials. The result was a complete build workflow with evidence-based scoring and exportable proof documentation.`
}

function generateLinkedInPost(input: ProofOfWorkInput): string {
  const goal = input.projectGoal || 'AI-native build workflow'
  return `I just built ${goal} using Praxis Forge — an AI-native pipeline that turns learning content and GitHub repos into executable build workflows, release-ready reports, and portfolio proof packs.

The process:
1. Ingested YouTube transcripts, blog posts, and AI coding agent logs
2. Analyzed the GitHub repo for maturity and risks
3. Generated a full build workflow with copyable AI agent prompts
4. Produced a release readiness report with evidence-based scoring
5. Exported everything as portfolio-ready documentation

No fake scores. No static dashboards. Real analysis from real sources.

Check out Praxis Forge — the knowledge-to-ship operator for AI-native builders.`
}

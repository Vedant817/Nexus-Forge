import type { ProofOfWorkInput, ProofOfWorkOutput } from '@/types'

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
  const verified = hasRepoAnalysis && completedCount > 0

  return {
    portfolioSummary: generatePortfolioSummary(input, verified),
    resumeBullet: generateResumeBullet(input, verified),
    demoVideoScript: generateDemoScript(input),
    interviewExplanation: generateInterviewExplanation(input, verified),
    linkedinPost: generateLinkedInPost(input, verified),
    missingProofItems: missingItems,
  }
}

const DRAFT_NOTICE = 'Draft — requires human review; nothing below is verified evidence of shipped work.'

function generatePortfolioSummary(input: ProofOfWorkInput, verified: boolean): string {
  const goal = input.projectGoal || 'an LLM-assisted project'
  if (!verified) return `${DRAFT_NOTICE} Draft plan for ${goal} as part of the Nexus Forge pipeline: learning sources and repository analysis have not yet produced verified completed work. Human review required before treating any of this as shipped.`
  return `Built ${goal} as part of the Nexus Forge pipeline. The project combines learning from multiple sources with repository analysis to generate actionable build workflows, release-readiness reports, and proof-of-work documentation. This demonstrates end-to-end LLM-assisted development from concept to review-ready output.`
}

function generateResumeBullet(input: ProofOfWorkInput, verified: boolean): string {
  const goal = input.projectGoal || 'LLM-assisted workflow automation'
  if (!verified) return `Draft plan for ${goal} using Nexus Forge (${DRAFT_NOTICE.toLowerCase()}).`
  return `Built and shipped ${goal} using Nexus Forge — an evidence-first workflow operator that ingests learning sources, analyzes repository readiness, generates executable build tasks with per-task prompts, and produces portfolio-ready proof-of-work documentation.`
}

function generateDemoScript(input: ProofOfWorkInput): string {
  return `[00:00] Introduce the problem: ${input.projectGoal || 'Building with AI assistance'}
[00:15] Show the project intake — adding sources, repo URL, and AI agent logs
[00:30] Walk through the knowledge distillation results
[00:45] Review the repository evidence and deterministic criteria
[01:00] Show the generated workflow board with tasks and agent prompts
[01:15] Review the release readiness report
[01:30] Export the proof pack as Markdown
[01:45] Summary and key takeaways`
}

function generateInterviewExplanation(input: ProofOfWorkInput, verified: boolean): string {
  if (!verified) return `${DRAFT_NOTICE} I drafted a plan for ${input.projectGoal || 'a project'} using Nexus Forge. No completed tasks have been verified yet; the workflow, risks, and proof material below are planning drafts for human review, not shipped results.`
  return `I built ${input.projectGoal || 'a project'} using Nexus Forge. The process started with ingesting learning content and repository context. A five-stage LLM-assisted pipeline organized the supplied evidence, drafted an executable workflow, reviewed release risks, and produced portfolio material for human review. The result was an exportable build workflow with versioned readiness findings and documented limitations.`
}

function generateLinkedInPost(input: ProofOfWorkInput, verified: boolean): string {
  const goal = input.projectGoal || 'an LLM-assisted build workflow'
  if (!verified) return `${DRAFT_NOTICE} Draft plan for ${goal} using Nexus Forge — an evidence-first pipeline draft. No shipped results are claimed; human review required before publishing any of this as portfolio material.`
  return `I just built ${goal} using Nexus Forge — an evidence-first pipeline that turns learning content and GitHub repos into executable build workflows, release-ready reports, and portfolio proof packs.

The process:
1. Ingested YouTube transcripts, blog posts, and AI coding agent logs
2. Analyzed the GitHub repo for maturity and risks
3. Generated a full build workflow with copyable per-task prompts
4. Produced a release readiness report with evidence-based scoring
5. Exported everything as portfolio-ready documentation

Versioned findings distinguish observed evidence, missing access, and unsupported checks.

Check out Nexus Forge — the evidence-first repository intelligence tool with a five-stage LLM-assisted pipeline.`
}

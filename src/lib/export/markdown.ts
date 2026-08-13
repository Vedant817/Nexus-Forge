import type { WorkflowPlannerOutput, ProofOfWorkOutput } from '@/types'

export function exportWorkflowMarkdown(workflow: WorkflowPlannerOutput): string {
  let md = `# ${workflow.workflowTitle}\n\n`
  md += `**Objective:** ${workflow.objective}\n\n`

  md += `## Tasks\n\n`
  for (const task of workflow.tasks) {
    md += `### ${task.title}\n`
    md += `- **Priority:** ${task.priority}\n`
    md += `- **Status:** ${task.status}\n`
    md += `- **Reason:** ${task.reason}\n\n`
    md += `**Description:**\n${task.description}\n\n`

    if (task.acceptanceCriteria.length > 0) {
      md += `**Acceptance Criteria:**\n`
      for (const ac of task.acceptanceCriteria) {
        md += `- [ ] ${ac}\n`
      }
      md += '\n'
    }

    if (task.suggestedAgentPrompt) {
      md += `**Agent Prompt:**\n\`\`\`\n${task.suggestedAgentPrompt}\n\`\`\`\n\n`
    }

    if (task.evidence.length > 0) {
      md += `**Evidence:**\n`
      for (const e of task.evidence) {
        md += `- ${e}\n`
      }
      md += '\n'
    }
  }

  md += `## Acceptance Criteria\n\n`
  for (const ac of workflow.acceptanceCriteria) {
    md += `- [ ] ${ac}\n`
  }

  md += `\n## Test Plan\n\n${workflow.testPlan}\n\n`

  if (workflow.suggestedAgentPrompts.length > 0) {
    md += `## Agent Prompts\n\n`
    for (const prompt of workflow.suggestedAgentPrompts) {
      md += `\`\`\`\n${prompt}\n\`\`\`\n\n`
    }
  }

  if (workflow.expectedFilesToChange.length > 0) {
    md += `## Expected Files to Change\n\n`
    for (const f of workflow.expectedFilesToChange) {
      md += `- \`${f}\`\n`
    }
  }

  return md
}

export function exportProofPackMarkdown(
  proof: ProofOfWorkOutput,
  scorecard?: { score: number | null; completenessRatio: number; version: string; evidenceIds: string[] },
): string {
  let md = `# Proof of Work Pack\n\n`

  md += `## Portfolio Summary\n\n${proof.portfolioSummary}\n\n`

  md += `## Resume Bullet\n\n${proof.resumeBullet}\n\n`

  md += `## Demo Video Script\n\n${proof.demoVideoScript}\n\n`

  md += `## Interview Explanation\n\n${proof.interviewExplanation}\n\n`

  md += `## LinkedIn Post\n\n${proof.linkedinPost}\n\n`

  md += `## Deterministic Proof Completeness\n\n`
  md += scorecard?.score === null || !scorecard
    ? `Score: Unknown (insufficient observed evidence)\n\n`
    : `Score: ${scorecard.score}/100\n\n`
  if (scorecard) {
    md += `Evidence completeness: ${Math.round(scorecard.completenessRatio * 100)}%  \nMethodology: ${scorecard.version}\n\n`
    md += `Evidence IDs:\n${scorecard.evidenceIds.length ? scorecard.evidenceIds.map((id) => `- ${id}`).join('\n') : '- None linked'}\n\n`
  }
  md += `> Limitation: portfolio text is an LLM-assisted, review-required draft. Unknown signals are not failures and no claim is verified without linked deterministic evidence.\n\n`

  if (proof.missingProofItems.length > 0) {
    md += `## Missing Proof Items\n\n`
    for (const item of proof.missingProofItems) {
      md += `- ${item}\n`
    }
  }

  return md
}

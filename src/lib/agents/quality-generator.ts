import type { QualityGeneratorOutput } from './quality-agent-schemas'

export async function qualityGenerator(
  unitId: string,
  title: string,
  description: string,
  acceptance: string,
  projectContext: string,
): Promise<QualityGeneratorOutput> {
  const { getAgentRunner } = await import('@/lib/lemma/lemma-client')
  const runner = await getAgentRunner()

  const input = {
    unitId,
    title,
    description,
    acceptance,
    projectContext,
    instructions: `You are a Quality Generator. Implement one unit of work from the improvement spec.

Given a unit description and acceptance criteria, propose precise file edits using the edit tool format (oldString → newString). Each edit must:
1. Be minimal and targeted — only change what's needed
2. Preserve all existing code style and conventions
3. Include exact surrounding context for the oldString match
4. Be safe to apply automatically

Return valid JSON matching the schema with an array of edits.`,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runner.runProofOfWork(input as any) as unknown as QualityGeneratorOutput
}

export function getGeneratorPrompt(
  unitTitle: string,
  unitDescription: string,
  acceptance: string,
  evaluatorFeedback?: string,
): string {
  const feedbackSection = evaluatorFeedback
    ? `\n\nPrevious attempt failed evaluation. Feedback to address:\n${evaluatorFeedback}`
    : ''

  return `You are a Quality Generator implementing one unit of work for the Hermes Forge project.

## Unit: ${unitTitle}
${unitDescription}

## Acceptance Criteria
${acceptance}
${feedbackSection}

## Rules
1. Propose exact file edits using oldString → newString format
2. Include enough surrounding context for safe matching
3. Never change unrelated files or code
4. Follow existing patterns and conventions
5. Each edit must be independently verifiable

Return valid JSON matching the quality generator output schema.`
}

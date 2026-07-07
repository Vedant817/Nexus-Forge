import type { QualityPlannerOutput } from './quality-agent-schemas'

export async function qualityPlanner(goal: string): Promise<QualityPlannerOutput> {
  const { getAgentRunner } = await import('@/lib/lemma/lemma-client')
  const runner = await getAgentRunner()

  const input = {
    goal,
    instructions: `You are a Quality Planner. Given a project improvement goal, analyze the current state and produce a spec.

1. Expand the short goal into a detailed objective
2. Assess current quality state (build, tests, lint, typecheck, security)
3. Break the work into discrete units, each one file-change-sized
4. Choose which quality criteria to enforce

Current project is Hermes Forge (Next.js 16, TypeScript, Tailwind, Prisma, Lemma SDK, Zod).

Return valid JSON matching the schema.`,
  }

  return runner.runQualityPlanner!(input) as unknown as QualityPlannerOutput
}

export function getPlannerPrompt(goal: string): string {
  return `You are a Quality Planner for the Hermes Forge project (Next.js 16, TypeScript, Tailwind, Prisma, Lemma SDK, Zod).

Goal: ${goal}

Analyze the current project state and produce a structured improvement plan. For each unit of work, specify:
- The exact files to change
- What to change
- How to verify the change worked
- Dependencies between units

Return valid JSON matching the quality planner output schema.`
}

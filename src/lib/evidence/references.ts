import type { ProofOfWorkOutput, ReleaseReadinessOutput, WorkflowPlannerOutput } from '@/types'

export type BoundedCitation = { claim: string; evidenceIds: string[]; limitations: string }

function constrainCitations(citations: BoundedCitation[] | undefined, allowed: Set<string>): BoundedCitation[] {
  return (citations ?? []).slice(0, 20).map((citation) => {
    const kept = [...new Set(citation.evidenceIds.filter((id) => allowed.has(id)))].slice(0, 20)
    const removed = citation.evidenceIds.length - kept.length
    return {
      claim: citation.claim.slice(0, 500),
      evidenceIds: kept,
      limitations: [citation.limitations.slice(0, 500), removed > 0 ? `${removed} unsupported reference(s) removed.` : ''].filter(Boolean).join(' ').slice(0, 500),
    }
  })
}

export function constrainWorkflowEvidenceReferences(
  workflow: WorkflowPlannerOutput,
  allowedEvidenceIds: readonly string[],
): WorkflowPlannerOutput {
  const allowed = new Set(allowedEvidenceIds)
  return {
    ...workflow,
    tasks: workflow.tasks.map((task) => ({
      ...task,
      evidence: [...new Set((task.evidence ?? []).filter((evidenceId) => allowed.has(evidenceId)))].slice(0, 100),
      citations: constrainCitations((task as { citations?: BoundedCitation[] }).citations, allowed),
    })),
    citations: constrainCitations((workflow as { citations?: BoundedCitation[] }).citations, allowed),
  }
}

export function constrainReleaseEvidenceReferences(
  release: ReleaseReadinessOutput,
  allowedEvidenceIds: readonly string[],
): ReleaseReadinessOutput {
  const allowed = new Set(allowedEvidenceIds)
  return { ...release, citations: constrainCitations((release as { citations?: BoundedCitation[] }).citations, allowed) }
}

export function constrainProofEvidenceReferences(
  proof: ProofOfWorkOutput,
  allowedEvidenceIds: readonly string[],
): ProofOfWorkOutput {
  const allowed = new Set(allowedEvidenceIds)
  return { ...proof, citations: constrainCitations((proof as { citations?: BoundedCitation[] }).citations, allowed) }
}

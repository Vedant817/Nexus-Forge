import { describe, expect, it } from 'vitest'
import { collectRunEvidence, repositoryFactsFromContext } from '@/lib/evidence/collectors'
import { evaluateScorecard } from '@/lib/evidence/evaluate'
import { CRITERION_REGISTRIES } from '@/lib/evidence/registry'
import { constrainWorkflowEvidenceReferences } from '@/lib/evidence/references'

describe('deterministic evidence scorecards', () => {
  const observedAt = new Date('2026-01-01T00:00:00.000Z')
  const base = {
    observedAt,
    project: { repoUrl: '', prUrl: '' },
    sources: [{ id: 'source-1', type: 'docs', title: 'Guide' }],
    proofArtifactHash: 'proof-hash',
  }

  it('contains only versioned deterministic definitions with positive weights', () => {
    for (const registry of Object.values(CRITERION_REGISTRIES)) {
      expect(registry.length).toBeGreaterThan(0)
      expect(registry.every((criterion) => criterion.version && criterion.weight > 0 && criterion.requiredEvidenceTypes.length > 0)).toBe(true)
    }
  })

  it('marks repository criteria N/A when deterministic scope has no repository', () => {
    const repository = evaluateScorecard('REPOSITORY_MATURITY', collectRunEvidence(base))
    expect(repository.results.every((result) => result.status === 'NOT_APPLICABLE')).toBe(true)
    expect(repository).toMatchObject({ score: null, completenessRatio: 1, applicableCount: 0 })
  })

  it('distinguishes observed absence, missing signals, and deterministic N/A', () => {
    const repositoryFacts = repositoryFactsFromContext({
      name: 'repo', description: '', defaultBranch: 'main', stars: 0, language: 'TypeScript',
      readme: '', tree: ['package.json'], packageJson: '{}', githubWorkflows: [],
    })
    const evidence = collectRunEvidence({ ...base, project: { repoUrl: 'https://github.com/o/r', prUrl: '' }, repositoryFacts })
    const repository = evaluateScorecard('REPOSITORY_MATURITY', evidence)
    expect(repository.results.find((result) => result.criterionId === 'repo.readme')?.status).toBe('FAIL')
    expect(repository.results.find((result) => result.criterionId === 'repo.tests')?.status).toBe('UNKNOWN')

    const release = evaluateScorecard('RELEASE_READINESS', evidence)
    expect(release.results.every((result) => result.status === 'NOT_APPLICABLE')).toBe(true)
    expect(release.score).toBeNull()
  })

  it('never treats merely present unevaluated check/review evidence as PASS', () => {
    const evidence = collectRunEvidence({
      ...base,
      project: { repoUrl: '', prUrl: 'https://github.com/o/r/pull/1' },
      pullRequestFacts: { changedFiles: ['src/a.ts'], changedFileCount: 1, hasTestChanges: false, hasDocChanges: false, additions: 1, deletions: 0, fileListComplete: false },
    })
    evidence.push({
      ...evidence[0], id: 'checks', stableEvidenceId: 'pull-request:checks', evidenceType: 'pull_request.checks',
      facts: { conclusion: 'failure' }, contentHash: 'checks-hash', provenance: 'PULL_REQUEST_SNAPSHOT',
    })
    const release = evaluateScorecard('RELEASE_READINESS', evidence)
    expect(release.results.find((result) => result.criterionId === 'release.checks')).toMatchObject({
      status: 'UNKNOWN', reasonCode: 'SIGNAL_NOT_EVALUATED', evidenceStableIds: ['pull-request:checks'],
    })
  })

  it('requires complete provenance for every source in scope', () => {
    const evidence = collectRunEvidence({
      ...base,
      sources: [
        { id: 'source-1', type: 'docs', title: 'One' },
        { id: 'source-2', type: 'docs', title: 'Two' },
      ],
    })
    const complete = evaluateScorecard('PROOF_COMPLETENESS', evidence)
    expect(complete.results.find((result) => result.criterionId === 'proof.sources')).toMatchObject({
      status: 'PASS', evidenceStableIds: ['source:source-1', 'source:source-2'],
    })
    const incomplete = evaluateScorecard('PROOF_COMPLETENESS', evidence.filter((record) => record.stableEvidenceId !== 'source:source-2'))
    expect(incomplete.results.find((result) => result.criterionId === 'proof.sources')?.status).toBe('UNKNOWN')
  })

  it('returns a nullable score when unknown weight makes evidence incomplete', () => {
    const evidence = collectRunEvidence({
      ...base,
      project: { repoUrl: '', prUrl: 'https://github.com/o/r/pull/1' },
      pullRequestFacts: { changedFiles: ['src/a.ts'], changedFileCount: 1, hasTestChanges: false, hasDocChanges: false, additions: 1, deletions: 0, fileListComplete: false },
    })
    const release = evaluateScorecard('RELEASE_READINESS', evidence)
    expect(release.unknownCount).toBeGreaterThan(0)
    expect(release.results.find((result) => result.criterionId === 'release.commit-pinned')?.status).toBe('UNKNOWN')
    expect(release.completenessRatio).toBeLessThan(0.8)
    expect(release.score).toBeNull()
    expect(evaluateScorecard('PROOF_COMPLETENESS', evidence).results.find((result) => result.criterionId === 'proof.pull-request')?.status).toBe('UNKNOWN')
  })

  it('bounds repository inventory facts and marks the API-limit boundary incomplete', () => {
    const facts = repositoryFactsFromContext({
      name: 'repo', description: '', defaultBranch: 'main', stars: 0, language: null,
      readme: '', tree: Array.from({ length: 1_001 }, (_, index) => `file-${index}.txt`), githubWorkflows: [],
    })
    expect(facts.rootPaths).toHaveLength(1_000)
    expect(facts.rootInventoryComplete).toBe(false)
  })

  it('produces stable IDs and hashes for retry-identical observations', () => {
    const first = collectRunEvidence(base)
    const second = collectRunEvidence(base)
    expect(second.map((record) => [record.stableEvidenceId, record.contentHash])).toEqual(
      first.map((record) => [record.stableEvidenceId, record.contentHash]),
    )
    expect(first.find((record) => record.evidenceType === 'source.snapshot')).toMatchObject({
      provenance: 'SOURCE_SNAPSHOT', confidence: 'HIGH',
    })
  })

  it('drops model-invented evidence references and deduplicates supplied IDs', () => {
    const constrained = constrainWorkflowEvidenceReferences({
      workflowTitle: 'Plan', objective: 'Build', acceptanceCriteria: [], testPlan: '', suggestedAgentPrompts: [], expectedFilesToChange: [], reviewChecklist: [],
      tasks: [{ id: '1', title: 'Task', description: '', status: 'planned', priority: 'high', reason: '', acceptanceCriteria: [], suggestedAgentPrompt: '', evidence: ['source:1', 'invented:claim', 'source:1'] }],
    }, ['source:1'])
    expect(constrained.tasks[0].evidence).toEqual(['source:1'])
  })

  it('links every non-unknown evaluated finding to persisted evidence identity', () => {
    const evidence = collectRunEvidence(base)
    const proof = evaluateScorecard('PROOF_COMPLETENESS', evidence)
    for (const result of proof.results.filter((entry) => entry.status === 'PASS' || entry.status === 'FAIL')) {
      expect(result.evidenceStableIds.length).toBeGreaterThan(0)
      expect(evidence.some((record) => result.evidenceStableIds.includes(record.stableEvidenceId))).toBe(true)
    }
  })
})

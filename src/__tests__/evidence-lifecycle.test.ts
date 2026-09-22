import { describe, expect, it } from 'vitest'
import { collectRunEvidence } from '@/lib/evidence/collectors'
import { constrainProofEvidenceReferences, constrainReleaseEvidenceReferences } from '@/lib/evidence/references'
import { proofOfWorkOutputSchema, releaseReadinessOutputSchema } from '@/lib/agents/agent-schemas'

describe('evidence lifecycle correction', () => {
  it('bounds LLM schemas and carries citations', () => {
    expect(() => releaseReadinessOutputSchema.parse({
      topRisks: Array.from({ length: 101 }, () => 'risk'),
      missingTests: [], missingDocs: [], configOrEnvIssues: [], backwardCompatibilityConcerns: [],
      releaseChecklist: [], releaseNotesDraft: '', recommendedFixesBeforeMerge: [],
    })).toThrow()
    const parsed = proofOfWorkOutputSchema.parse({
      portfolioSummary: 'summary', resumeBullet: 'bullet', demoVideoScript: 'script',
      interviewExplanation: 'expl', linkedinPost: 'post', missingProofItems: [],
      citations: [{ claim: 'Ships feature', evidenceIds: ['source:s-1', 'bogus'], limitations: '' }],
    })
    expect(parsed.citations).toHaveLength(1)
  })

  it('marks unsupported generated claims instead of silently keeping them', () => {
    const release = constrainReleaseEvidenceReferences({
      topRisks: [], missingTests: [], missingDocs: [], configOrEnvIssues: [],
      backwardCompatibilityConcerns: [], releaseChecklist: [], releaseNotesDraft: '',
      recommendedFixesBeforeMerge: [], citations: [{ claim: 'Ready', evidenceIds: ['source:s-1', 'nope'], limitations: '' }],
    }, ['source:s-1'])
    expect(release.citations?.[0].evidenceIds).toEqual(['source:s-1'])
    expect(release.citations?.[0].limitations).toContain('unsupported')
    const proof = constrainProofEvidenceReferences({
      portfolioSummary: '', resumeBullet: '', demoVideoScript: '', interviewExplanation: '',
      linkedinPost: '', missingProofItems: [], citations: [{ claim: 'Done', evidenceIds: ['ghost'], limitations: '' }],
    }, [])
    expect(proof.citations?.[0].evidenceIds).toEqual([])
    expect(proof.citations?.[0].limitations).toContain('unsupported')
  })

  it('adds source hashes, byte counts, and snapshot identity to source evidence', () => {
    const evidence = collectRunEvidence({
      observedAt: new Date('2026-01-01T00:00:00Z'),
      project: { repoUrl: '', prUrl: '' },
      sources: [{ id: 's-1', type: 'notes', title: 'Note', contentHash: 'abc', byteCount: 12, contentType: 'text' }],
      inputHash: 'snapshot-1',
    })
    const record = evidence.find((entry) => entry.stableEvidenceId === 'source:s-1')
    expect(record?.facts).toMatchObject({ contentHash: 'abc', byteCount: 12, contentType: 'text', snapshotIdentity: 'snapshot-1' })
    expect(record?.collectorVersion).toBeTruthy()
    expect(record?.observedAt).toBeInstanceOf(Date)
  })
})

import { describe, expect, it } from 'vitest'
import { preflightAdmission, verifyAdmissionManifest } from '@/lib/execution/preflight'

const baseProject = {
  id: 'project-1',
  ownerId: 'user-1',
  repoUrl: '',
  prUrl: '',
  githubRepositoryPrivate: false,
  externalInferenceEnabled: true,
  externalInferenceAuthorizedBy: 'user-1',
  externalInferenceAuthorizedAt: new Date(),
  ingestionSuspendedAt: null,
  inferenceSuspendedAt: null,
  sources: [{ id: 'source-1', type: 'notes', title: 'Test', content: 'Hello' }],
}

describe('admission preflight and manifest', () => {
  it('admits exactly one immutable manifest with a digest', () => {
    const admitted = preflightAdmission({
      project: baseProject,
      actorId: 'user-1',
      inputSnapshot: { hello: 'world' },
      inputHash: 'abc',
      modelConfig: { provider: 'groq', model: 'test-model' },
    })
    expect(admitted.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(admitted.manifest).toMatchObject({ projectId: 'project-1', tenantId: 'user-1', processingMode: 'INFERENCE_ENABLED' })
    expect(() => verifyAdmissionManifest({ admissionManifest: admitted.manifest, admissionDigest: admitted.digest })).not.toThrow()
  })

  it('rejects tampered manifest content', () => {
    const admitted = preflightAdmission({
      project: baseProject,
      actorId: 'user-1',
      inputSnapshot: {},
      inputHash: 'abc',
      modelConfig: { provider: 'groq', model: 'test-model' },
    })
    expect(() => verifyAdmissionManifest({
      admissionManifest: { ...admitted.manifest, processingMode: 'DETERMINISTIC_ONLY' },
      admissionDigest: admitted.digest,
    })).toThrow(/integrity/)
  })

  it('fails closed on authorization, suspension, and quota violations without admission', () => {
    expect(() => preflightAdmission({ project: baseProject, actorId: 'intruder', inputSnapshot: {}, inputHash: 'x', modelConfig: {} })).toThrow(/authorization/)
    expect(() => preflightAdmission({ project: { ...baseProject, ingestionSuspendedAt: new Date() }, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: {} })).toThrow(/suspended/)
    expect(() => preflightAdmission({ project: { ...baseProject, sources: Array.from({ length: 100 }, (_, index) => ({ id: `s-${index}`, type: 'notes', title: 't', content: 'c' })) }, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: {} })).toThrow(/quota/)
  })
})

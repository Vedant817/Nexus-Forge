import { describe, expect, it } from 'vitest'
import { buildAdmissionManifest, resolveProcessingMode } from '@/lib/ai/data-policy'

describe('data-transfer policy', () => {
  it('defaults private and unknown visibility to deterministic-only', () => {
    expect(resolveProcessingMode({ githubRepositoryPrivate: true, externalInferenceEnabled: true, externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date() }, true)).toBe('INFERENCE_ENABLED')
    expect(resolveProcessingMode({ githubRepositoryPrivate: true, externalInferenceEnabled: false }, true)).toBe('DETERMINISTIC_ONLY')
    expect(resolveProcessingMode({ githubRepositoryPrivate: null, externalInferenceEnabled: true, externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date() }, true)).toBe('DETERMINISTIC_ONLY')
    expect(resolveProcessingMode({ githubRepositoryPrivate: false, externalInferenceEnabled: true, externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date() }, true)).toBe('INFERENCE_ENABLED')
    expect(resolveProcessingMode({ githubRepositoryPrivate: false, externalInferenceEnabled: true, externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date() }, false)).toBe('DETERMINISTIC_ONLY')
    expect(resolveProcessingMode({ githubRepositoryPrivate: false, externalInferenceEnabled: true, externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date(), inferenceSuspendedAt: new Date() }, true)).toBe('DETERMINISTIC_ONLY')
  })

  it('builds a digest-bound admission manifest', () => {
    const first = buildAdmissionManifest({
      projectId: 'project-1', ownerId: 'user-1', actorId: 'user-1', processingMode: 'DETERMINISTIC_ONLY',
      repositoryPrivate: true, inputHash: 'abc', pipelineVersion: 'p1', collectorVersion: 'c1', scorecardVersion: 's1', modelConfig: { provider: 'none' },
    })
    const second = buildAdmissionManifest({
      projectId: 'project-1', ownerId: 'user-1', actorId: 'user-1', processingMode: 'INFERENCE_ENABLED',
      repositoryPrivate: true, inputHash: 'abc', pipelineVersion: 'p1', collectorVersion: 'c1', scorecardVersion: 's1', modelConfig: { provider: 'groq' },
    })
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(first.digest).not.toBe(second.digest)
    expect(first.manifest).toMatchObject({ processingMode: 'DETERMINISTIC_ONLY' })
  })
})

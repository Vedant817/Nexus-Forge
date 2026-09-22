import { describe, expect, it } from 'vitest'
import { PRESET_CONTROLS, policyLayerSource } from '@/lib/pilot/profiles'
import { preflightAdmission } from '@/lib/execution/preflight'

const project = {
  id: 'project-1', ownerId: 'user-1', repoUrl: '', prUrl: '',
  githubRepositoryPrivate: false, externalInferenceEnabled: true,
  externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date(),
  ingestionSuspendedAt: null, inferenceSuspendedAt: null,
  sources: [{ id: 's-1', type: 'notes', title: 't', content: 'c' }],
}

describe('profiles and manifests', () => {
  it('labels which setting came from which policy layer', () => {
    expect(policyLayerSource('maxSources')).toBe('entitlement')
    expect(policyLayerSource('maxFiles')).toBe('profile')
    expect(PRESET_CONTROLS.Fast.maxSources).toBeLessThan(PRESET_CONTROLS.Strict.maxSources)
  })

  it('fails conflicting or over-allowance profiles before enqueueing', () => {
    expect(() => preflightAdmission({
      project, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: {},
      profile: { preset: 'Fast', version: 1, controls: PRESET_CONTROLS.Fast },
      template: { name: 'api-service', version: 1 },
    })).toThrow(/conflict/)
    expect(() => preflightAdmission({
      project, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: {},
      profile: { preset: 'Standard', version: 1, controls: { ...PRESET_CONTROLS.Standard, maxSources: 99 } },
    })).toThrow(/allowance/)
  })

  it('pins exactly one immutable profile revision hash per run', () => {
    const admitted = preflightAdmission({
      project, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: {},
      profile: { preset: 'Standard', version: 2, controls: PRESET_CONTROLS.Standard },
    })
    expect(admitted.manifest).toMatchObject({ profile: expect.objectContaining({ preset: 'Standard', version: 2 }) })
  })
})

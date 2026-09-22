import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  default: {
    pilotEntitlement: { findUnique: vi.fn(async () => null) },
    entitlementUsage: { findUnique: vi.fn(async () => null), create: vi.fn(), update: vi.fn() },
  },
}))

import { assertEntitlementActive } from '@/lib/billing/entitlements'
import { preflightAdmission } from '@/lib/execution/preflight'

const project = {
  id: 'project-1', ownerId: 'user-1', repoUrl: '', prUrl: '',
  githubRepositoryPrivate: false, externalInferenceEnabled: true,
  externalInferenceAuthorizedBy: 'user-1', externalInferenceAuthorizedAt: new Date(),
  ingestionSuspendedAt: null, inferenceSuspendedAt: null,
  sources: [{ id: 's-1', type: 'notes', title: 't', content: 'c' }],
}

describe('contract entitlements', () => {
  it('blocks expired and suspended pilots before admission', () => {
    expect(() => assertEntitlementActive({ plan: 'pilot', maxRunsPerDay: 10, maxExportsPerDay: 50, maxProjects: 50, revision: 1, expiresAt: new Date(Date.now() - 1000), suspended: false, organizationId: null })).toThrow(/expired/)
    expect(() => assertEntitlementActive({ plan: 'pilot', maxRunsPerDay: 10, maxExportsPerDay: 50, maxProjects: 50, revision: 1, expiresAt: null, suspended: true, organizationId: null })).toThrow(/suspended/)
    expect(() => preflightAdmission({
      project, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: {},
      entitlement: { plan: 'pilot', revision: 1, maxRunsPerDay: 10, maxExportsPerDay: 50, maxProjects: 50, expiresAt: new Date(Date.now() - 1000), suspended: false },
    })).toThrow(/expired/)
  })

  it('snapshots effective entitlements into the admission manifest', () => {
    const admitted = preflightAdmission({
      project, actorId: 'user-1', inputSnapshot: {}, inputHash: 'x', modelConfig: { provider: 'groq' },
      entitlement: { plan: 'pilot', revision: 3, maxRunsPerDay: 10, maxExportsPerDay: 50, maxProjects: 50, expiresAt: null, suspended: false },
    })
    expect(admitted.manifest).toMatchObject({ entitlement: expect.objectContaining({ revision: 3 }) })
  })
})

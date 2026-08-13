import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(), repo: vi.fn(), release: vi.fn(), proof: vi.fn(),
}))
vi.mock('@/lib/auth/authorization', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/db/prisma', () => ({
  default: {
    repoAnalysis: { findUnique: mocks.repo },
    releaseReport: { findUnique: mocks.release },
    proofPack: { findUnique: mocks.proof },
  },
}))

import { GET as getRepo } from '@/app/api/projects/[id]/repo-analysis/route'
import { GET as getRelease } from '@/app/api/projects/[id]/release-report/route'
import { GET as getProof } from '@/app/api/projects/[id]/proof-pack/route'

const context = { params: Promise.resolve({ id: 'project-1' }) }

describe('legacy score routes expose canonical nullable semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ ok: true, value: { user: { id: 'user-1' } } })
  })

  it.each([
    ['repo', getRepo, mocks.repo, 'maturityScore'],
    ['release', getRelease, mocks.release, 'releaseScore'],
    ['proof', getProof, mocks.proof, 'proofScore'],
  ] as const)('returns null canonical score for unknown %s projection', async (_name, route, finder, field) => {
    finder.mockResolvedValue({ id: 'row-1', projectId: 'project-1', [field]: 0, scoreStatus: 'unknown', scoreCompleteness: 0.5 })
    const response = await route(new Request('http://localhost'), context)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      score: null,
      scoreStatus: 'unknown',
      completeness: 0.5,
      legacyScoreField: field,
      legacyScoreDeprecated: true,
    })
  })
})

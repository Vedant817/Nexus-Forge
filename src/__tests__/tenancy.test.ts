import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  findMembership: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  default: {
    project: { findUnique: mocks.findProject },
    membership: { findUnique: mocks.findMembership },
  },
}))

import { canPerform, requireTenantAction } from '@/lib/auth/tenancy'

describe('workspace tenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('enforces deny-by-default role contract', () => {
    expect(canPerform('connect_repository', 'ADMIN')).toBe(true)
    expect(canPerform('connect_repository', 'OPERATOR')).toBe(false)
    expect(canPerform('create_run', 'OPERATOR')).toBe(true)
    expect(canPerform('create_run', 'REVIEWER')).toBe(false)
    expect(canPerform('view', 'VIEWER')).toBe(true)
    expect(canPerform('approve_inference', 'OPERATOR')).toBe(false)
  })

  it('returns 404 for cross-tenant access without revealing existence', async () => {
    mocks.findProject.mockResolvedValue({ ownerId: 'owner-1', organizationId: 'org-1' })
    mocks.findMembership.mockResolvedValue(null)
    await expect(requireTenantAction('project-1', 'intruder', 'view')).resolves.toMatchObject({ ok: false, status: 404 })
  })

  it('blocks insufficient roles with 403', async () => {
    mocks.findProject.mockResolvedValue({ ownerId: 'owner-1', organizationId: 'org-1' })
    mocks.findMembership.mockResolvedValue({ role: 'VIEWER' })
    await expect(requireTenantAction('project-1', 'viewer-1', 'create_run')).resolves.toMatchObject({ ok: false, status: 403 })
  })

  it('allows owners without a membership lookup', async () => {
    mocks.findProject.mockResolvedValue({ ownerId: 'owner-1', organizationId: 'org-1' })
    await expect(requireTenantAction('project-1', 'owner-1', 'connect_repository')).resolves.toMatchObject({ ok: true, role: 'OWNER' })
    expect(mocks.findMembership).not.toHaveBeenCalled()
  })
})

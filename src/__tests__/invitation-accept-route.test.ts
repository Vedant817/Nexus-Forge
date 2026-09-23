import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  logAudit: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/lib/security/audit-log', () => ({ logAudit: mocks.logAudit }))
vi.mock('@/lib/db/prisma', () => ({
  default: { invitation: { findUnique: mocks.findUnique }, $transaction: mocks.transaction },
}))

import { POST } from '@/app/api/invitations/[token]/accept/route'

function acceptRequest(): Request {
  return new Request('http://localhost/api/invitations/secret-token/accept', { method: 'POST' })
}

const invitation = {
  id: 'inv-1',
  organizationId: 'org-1',
  email: 'alice@example.com',
  role: 'MEMBER',
  acceptedAt: null,
  expiresAt: new Date(Date.now() + 3600_000),
}

describe('POST invitation accept', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockClear()
    mocks.requireSession.mockResolvedValue({ ok: true, value: { id: 'user-1', email: 'alice@example.com' } })
    mocks.logAudit.mockResolvedValue(undefined)
    mocks.findUnique.mockResolvedValue({ ...invitation })
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({ membership: { upsert: vi.fn(async () => ({})) }, invitation: { update: vi.fn(async () => ({})) } }),
    )
  })

  it('binds the membership when the session email matches the invitee', async () => {
    const response = await POST(acceptRequest(), { params: Promise.resolve({ token: 'secret-token' }) })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ organizationId: 'org-1', role: 'MEMBER' })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('rejects a different identity holding the link without writing membership', async () => {
    mocks.requireSession.mockResolvedValue({ ok: true, value: { id: 'user-2', email: 'bob@example.com' } })
    const response = await POST(acceptRequest(), { params: Promise.resolve({ token: 'secret-token' }) })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('different email') })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.logAudit).toHaveBeenCalledWith('membership_changed', 'Invitation email mismatch', '', expect.objectContaining({ outcome: 'failure' }))
  })

  it('matches invitee email case-insensitively', async () => {
    mocks.requireSession.mockResolvedValue({ ok: true, value: { id: 'user-1', email: 'Alice@Example.COM' } })
    const response = await POST(acceptRequest(), { params: Promise.resolve({ token: 'secret-token' }) })
    expect(response.status).toBe(200)
  })

  it('returns 404 for consumed or expired invitations', async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...invitation, acceptedAt: new Date() })
    expect((await POST(acceptRequest(), { params: Promise.resolve({ token: 'secret-token' }) })).status).toBe(404)
    mocks.findUnique.mockResolvedValueOnce({ ...invitation, expiresAt: new Date(Date.now() - 1000) })
    expect((await POST(acceptRequest(), { params: Promise.resolve({ token: 'secret-token' }) })).status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

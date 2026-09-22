import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@/lib/db/prisma', () => ({ default: { auditLog: { create: mocks.create } } }))

import { logAudit } from '@/lib/security/audit-log'

describe('attributed audit ledger', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records attribution without code, prompts, or secrets', async () => {
    const secret = `ghp_${'a'.repeat(36)}`
    await logAudit('privacy_updated', `changed ${secret} plus code const x = 1`, 'project-1', {
      actorId: 'user-1', organizationId: 'org-1', targetId: 'project-1', requestId: 'req-1', iface: 'api', outcome: 'success',
    })
    expect(mocks.create).toHaveBeenCalledOnce()
    const data = mocks.create.mock.calls[0][0].data
    expect(data).toMatchObject({ action: 'privacy_updated', userId: 'user-1', organizationId: 'org-1', requestId: 'req-1' })
    expect(JSON.stringify(data)).not.toContain(secret)
  })

  it('bounds details length for safe export', async () => {
    await logAudit('error', 'x'.repeat(5000), 'project-1')
    const data = mocks.create.mock.calls[0][0].data
    expect(data.details.length).toBeLessThanOrEqual(2000)
  })
})

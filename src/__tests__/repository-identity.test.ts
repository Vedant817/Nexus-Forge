import { describe, expect, it } from 'vitest'
import { resolveRepositoryIdentity } from '@/lib/github/repository-identity'

describe('repository identity', () => {
  it('derives identity from a repository URL', () => {
    expect(resolveRepositoryIdentity('https://github.com/Owner/Repo', '')).toEqual({
      ok: true,
      fullName: 'owner/repo',
    })
  })

  it('derives identity for a pull-request-only project', () => {
    expect(resolveRepositoryIdentity('', 'https://github.com/Owner/Repo/pull/42')).toEqual({
      ok: true,
      fullName: 'owner/repo',
    })
  })

  it('rejects conflicting repository and pull-request URLs', () => {
    expect(
      resolveRepositoryIdentity(
        'https://github.com/owner/one',
        'https://github.com/owner/two/pull/1',
      ),
    ).toMatchObject({ ok: false })
  })
})

import { describe, expect, it } from 'vitest'
import { diagnoseGitHubEmail, resolveGitHubEmail, toGitHubUser } from '@/lib/auth/github-userinfo'

describe('GitHub identity resolution', () => {
  it('prefers the profile email and marks verification from the list', () => {
    expect(
      resolveGitHubEmail({ email: 'a@example.com' }, [{ email: 'a@example.com', primary: true, verified: true }]),
    ).toEqual({ email: 'a@example.com', emailVerified: true })
  })

  it('falls back to the primary email, then the first entry', () => {
    expect(resolveGitHubEmail({ email: null }, [
      { email: 'other@example.com', primary: false, verified: true },
      { email: 'main@example.com', primary: true, verified: false },
    ])).toEqual({ email: 'main@example.com', emailVerified: false })
    expect(resolveGitHubEmail({ email: null }, [{ email: 'only@example.com' }])).toEqual({ email: 'only@example.com', emailVerified: false })
  })

  it('yields no email for empty or unavailable lists', () => {
    expect(resolveGitHubEmail({ email: null }, [])).toEqual({ email: null, emailVerified: false })
    expect(resolveGitHubEmail({ email: null }, null)).toEqual({ email: null, emailVerified: false })
  })

  it('diagnoses without PII', () => {
    expect(diagnoseGitHubEmail(200, [])).toBe('emails-empty-0')
    expect(diagnoseGitHubEmail(403, null)).toBe('emails-unavailable')
    const diagnosis = diagnoseGitHubEmail(200, [{ email: 'secret@example.com' }])
    expect(diagnosis).not.toContain('secret@example.com')
  })

  it('shapes the better-auth user without leaking internals', () => {
    const result = toGitHubUser({ id: 42, login: 'octo', email: null }, 'a@example.com', true)
    expect(result.user).toEqual({ id: '42', name: 'octo', email: 'a@example.com', image: undefined, emailVerified: true })
  })
})

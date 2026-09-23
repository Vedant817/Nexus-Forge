import { describe, expect, it } from 'vitest'
import { describeOAuthError } from '@/lib/auth/oauth-errors'

describe('OAuth error copy', () => {
  it('explains a missing GitHub email with a fix', () => {
    expect(describeOAuthError('email_not_found', undefined)).toContain('Email addresses → Read-only')
  })

  it('falls back to the provider description and then a generic message', () => {
    expect(describeOAuthError('something_new', 'Provider says no.')).toBe('Provider says no.')
    expect(describeOAuthError('something_new', undefined)).toContain('try again')
  })

  it('returns null without an error code', () => {
    expect(describeOAuthError(undefined, undefined)).toBeNull()
  })
})

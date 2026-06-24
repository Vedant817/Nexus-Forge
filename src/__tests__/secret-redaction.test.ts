import { describe, it, expect } from 'vitest'
import { redactSecrets, isPotentialSecret } from '@/lib/security/secret-redaction'

describe('redactSecrets', () => {
  it('redacts GitHub tokens', () => {
    const result = redactSecrets('Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890')
    expect(result).toContain('[REDACTED]')
    expect(result).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890')
  })

  it('redacts OpenAI API keys', () => {
    const result = redactSecrets('Key: sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(result).toContain('[REDACTED]')
  })

  it('handles text without secrets', () => {
    const result = redactSecrets('This is just normal text about programming.')
    expect(result).toBe('This is just normal text about programming.')
  })
})

describe('isPotentialSecret', () => {
  it('detects potential secrets', () => {
    expect(isPotentialSecret('ghp_abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true)
    expect(isPotentialSecret('sk-abcdefghijklmnopqrstuvwxyz123456')).toBe(true)
  })

  it('returns false for normal text', () => {
    expect(isPotentialSecret('hello world')).toBe(false)
  })
})

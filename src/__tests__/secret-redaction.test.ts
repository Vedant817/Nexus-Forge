import { describe, expect, it } from 'vitest'
import { isPotentialSecret, redactSecrets, redactStructuredValue } from '@/lib/security/secret-redaction'

const secrets = [
  `gsk_${'a'.repeat(32)}`,
  `sk-proj-${'b'.repeat(32)}`,
  `eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(20)}.${'c'.repeat(24)}`,
  `-----${'BEGIN PRIVATE KEY'}-----\nvery-sensitive-private-material\n-----END PRIVATE KEY-----`,
  'postgresql://admin:super-secret@db.example.test:5432/app',
  `npm_${'d'.repeat(36)}`,
  `xoxb-${'1'.repeat(12)}-${'e'.repeat(32)}`,
  'https://hooks.slack.com/' + 'services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
  `DATABASE_URL="postgresql://user:pass@localhost:5432/app"`,
  `API_KEY=${'f'.repeat(32)}`,
  `password: '${'g'.repeat(24)}'`,
  `sk-ant-api03-${'h'.repeat(40)}`,
  `AIza${'i'.repeat(35)}`,
  `glpat-${'j'.repeat(24)}`,
  'rediss://default:redis-secret@cache.example.test:6380/0',
  `-----${'BEGIN ENCRYPTED PRIVATE KEY'}-----\nencrypted-private-material\n-----END ENCRYPTED PRIVATE KEY-----`,
]

describe('secret redaction coverage', () => {
  it.each(secrets)('redacts supported credential form %#', (secret) => {
    const redacted = redactSecrets(`before ${secret} after`)
    expect(redacted).not.toContain(secret)
    expect(redacted).toContain('[REDACTED]')
    expect(isPotentialSecret(secret)).toBe(true)
  })

  it('redacts nested pre-provider and generated output values without altering safe values', () => {
    const value = {
      input: [{ token: secrets[0] }, { database: secrets[4] }],
      output: { slack: secrets[6], safe: 'ordinary repository text' },
    }
    expect(redactStructuredValue(value)).toEqual({
      input: [{ token: '[REDACTED]' }, { database: '[REDACTED]' }],
      output: { slack: '[REDACTED]', safe: 'ordinary repository text' },
    })
  })

  it('avoids redacting ordinary short assignments and package names', () => {
    const safe = 'token=count password=optional package=sk-test api_key=local'
    expect(redactSecrets(safe)).toBe(safe)
  })
})

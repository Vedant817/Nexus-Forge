import { describe, expect, it } from 'vitest'
import { hasBlockingFinding, isHighRiskPath, scanSecretContent, shannonEntropy } from '@/lib/security/secret-scanner'

describe('secret scanner corpus', () => {
  it('detects provider credential formats without returning secret values', () => {
    const positives = [
      `key=${`ghp_${'a'.repeat(36)}`}`,
      `token=${`gsk_${'b'.repeat(30)}`}`,
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      'postgresql://admin:super-secret@db.example.test:5432/app',
      'AKIAIOSFODNN7EXAMPLE',
    ]
    for (const secret of positives) {
      const findings = scanSecretContent(`before ${secret} after`)
      expect(hasBlockingFinding(findings)).toBe(true)
      expect(JSON.stringify(findings)).not.toContain(secret.slice(0, 12))
    }
  })

  it('detects high-entropy unknown tokens and split-token bypass shapes', () => {
    const entropyToken = 'x'.repeat(4) + 'A9fQ2zX7mB4vT8qW1eR6yU3iO5pL0kJ9hG'
    expect(shannonEntropy(entropyToken)).toBeGreaterThan(4)
    expect(hasBlockingFinding(scanSecretContent(`api_key = "${entropyToken}"`))).toBe(true)
    expect(scanSecretContent('const token = secret + "abcd1234"', 'app.ts').some((finding) => finding.kind === 'split_token_suspicious')).toBe(true)
  })

  it('excludes high-risk paths and avoids ordinary assignments', () => {
    expect(isHighRiskPath('.env')).toBe(true)
    expect(isHighRiskPath('src/.aws/credentials')).toBe(true)
    expect(isHighRiskPath('src/app.ts')).toBe(false)
    expect(hasBlockingFinding(scanSecretContent('password = "short"'))).toBe(false)
    expect(hasBlockingFinding(scanSecretContent('ordinary repository text with package name'))).toBe(false)
  })
})

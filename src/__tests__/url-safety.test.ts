import { describe, it, expect } from 'vitest'
import { parseGitHubRepoUrl, parseGitHubPrUrl, isSafeUrl } from '@/lib/security/url-safety'

describe('isSafeUrl', () => {
  it('allows valid github.com URLs', () => {
    expect(isSafeUrl('https://github.com/owner/repo').safe).toBe(true)
    expect(isSafeUrl('https://github.com/owner/repo/pull/1').safe).toBe(true)
    expect(isSafeUrl('https://api.github.com/repos/owner/repo').safe).toBe(true)
  })

  it('rejects non-HTTPS URLs', () => {
    expect(isSafeUrl('http://github.com/owner/repo').safe).toBe(false)
    expect(isSafeUrl('ftp://github.com/owner').safe).toBe(false)
  })

  it('rejects file:// URLs', () => {
    expect(isSafeUrl('file:///etc/passwd').safe).toBe(false)
  })

  it('rejects localhost URLs', () => {
    expect(isSafeUrl('https://localhost:3000').safe).toBe(false)
    expect(isSafeUrl('https://127.0.0.1').safe).toBe(false)
  })

  it('rejects private IP ranges', () => {
    expect(isSafeUrl('https://10.0.0.1').safe).toBe(false)
    expect(isSafeUrl('https://192.168.1.1').safe).toBe(false)
    expect(isSafeUrl('https://172.16.0.1').safe).toBe(false)
  })

  it('rejects non-github domains', () => {
    expect(isSafeUrl('https://example.com').safe).toBe(false)
    expect(isSafeUrl('https://evil.com/steal').safe).toBe(false)
  })
})

describe('parseGitHubRepoUrl', () => {
  it('parses valid repo URLs', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.owner).toBe('owner')
      expect(result.data.repo).toBe('repo')
    }
  })

  it('parses repo URLs with .git suffix', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo.git')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.repo).toBe('repo')
    }
  })

  it('parses repo URLs with trailing slash', () => {
    const result = parseGitHubRepoUrl('https://github.com/owner/repo/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.owner).toBe('owner')
      expect(result.data.repo).toBe('repo')
    }
  })

  it('rejects invalid repo URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/').ok).toBe(false)
    expect(parseGitHubRepoUrl('not-a-url').ok).toBe(false)
  })
})

describe('parseGitHubPrUrl', () => {
  it('parses valid PR URLs', () => {
    const result = parseGitHubPrUrl('https://github.com/owner/repo/pull/42')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.owner).toBe('owner')
      expect(result.data.repo).toBe('repo')
      expect(result.data.pullNumber).toBe(42)
    }
  })

  it('rejects PR URLs with invalid PR number', () => {
    expect(parseGitHubPrUrl('https://github.com/owner/repo/pull/0').ok).toBe(false)
    expect(parseGitHubPrUrl('https://github.com/owner/repo/pull/-1').ok).toBe(false)
    expect(parseGitHubPrUrl('https://github.com/owner/repo/pull/abc').ok).toBe(false)
  })

  it('rejects non-PR URLs', () => {
    expect(parseGitHubPrUrl('https://github.com/owner/repo').ok).toBe(false)
  })
})

export interface ParsedRepoUrl {
  owner: string
  repo: string
}

export interface ParsedPrUrl {
  owner: string
  repo: string
  pullNumber: number
}

const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\/|$)/
const GITHUB_PR_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)\/pull\/(\d+)/

function isPrivateIP(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts[0] === '10') return true
  if (parts[0] === '172' && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return true
  if (parts[0] === '192' && parts[1] === '168') return true
  if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0') return true
  if (hostname === '[::1]') return true
  return false
}

export function isSafeUrl(url: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTPS URLs are allowed' }
    }
    if (parsed.hostname !== 'github.com' && parsed.hostname !== 'api.github.com') {
      return { safe: false, reason: 'Only github.com URLs are allowed' }
    }
    if (isPrivateIP(parsed.hostname)) {
      return { safe: false, reason: 'Private IP ranges are not allowed' }
    }
    return { safe: true }
  } catch {
    return { safe: false, reason: 'Invalid URL format' }
  }
}

export function parseGitHubRepoUrl(url: string): { ok: true; data: ParsedRepoUrl } | { ok: false; error: string } {
  const safety = isSafeUrl(url)
  if (!safety.safe) {
    return { ok: false, error: safety.reason! }
  }

  const match = url.match(GITHUB_REPO_REGEX)
  if (!match) {
    return { ok: false, error: 'Invalid GitHub repository URL format. Expected: https://github.com/:owner/:repo' }
  }

  return { ok: true, data: { owner: match[1], repo: match[2].replace(/\.git$/, '') } }
}

export function parseGitHubPrUrl(url: string): { ok: true; data: ParsedPrUrl } | { ok: false; error: string } {
  const safety = isSafeUrl(url)
  if (!safety.safe) {
    return { ok: false, error: safety.reason! }
  }

  const match = url.match(GITHUB_PR_REGEX)
  if (!match) {
    return { ok: false, error: 'Invalid GitHub PR URL format. Expected: https://github.com/:owner/:repo/pull/:number' }
  }

  const pullNumber = parseInt(match[3], 10)
  if (isNaN(pullNumber) || pullNumber < 1) {
    return { ok: false, error: 'Invalid PR number' }
  }

  return { ok: true, data: { owner: match[1], repo: match[2], pullNumber } }
}

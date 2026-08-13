import { parseGitHubPrUrl, parseGitHubRepoUrl } from '@/lib/security/url-safety'

export type RepositoryIdentityResult =
  | { ok: true; fullName: string | null }
  | { ok: false; error: string }

export function resolveRepositoryIdentity(repoUrl: string, prUrl: string): RepositoryIdentityResult {
  let repoFullName: string | null = null
  let pullRequestFullName: string | null = null

  if (repoUrl) {
    const parsed = parseGitHubRepoUrl(repoUrl)
    if (!parsed.ok) return parsed
    repoFullName = `${parsed.data.owner}/${parsed.data.repo}`.toLowerCase()
  }

  if (prUrl) {
    const parsed = parseGitHubPrUrl(prUrl)
    if (!parsed.ok) return parsed
    pullRequestFullName = `${parsed.data.owner}/${parsed.data.repo}`.toLowerCase()
  }

  if (repoFullName && pullRequestFullName && repoFullName !== pullRequestFullName) {
    return { ok: false, error: 'Repository URL and pull request URL must refer to the same repository' }
  }

  return { ok: true, fullName: repoFullName ?? pullRequestFullName }
}

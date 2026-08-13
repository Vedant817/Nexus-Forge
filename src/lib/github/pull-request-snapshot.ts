import 'server-only'

import { createInstallationToken } from './app-auth'
import { githubJson, githubPaginate } from './http'
import { parseGitHubPrUrl } from '@/lib/security/url-safety'

export type PullRequestCheck = { id: string; name: string; status: string; conclusion: string | null }
export type PullRequestReview = { id: string; state: string; submittedAt: string | null }

export type CollectedPullRequestContext = {
  title: string; body: string; changedFiles: string[]; diff: string; additions: number; deletions: number
  headSha: string; baseSha: string; mergedCommitSha: string | null
  fileListComplete: boolean; reviewsComplete: boolean; checksComplete: boolean
  reviews: PullRequestReview[]; checks: PullRequestCheck[]; diagnostics: string[]
}

type Pr = { title: string; body: string | null; changed_files: number; head: { sha: string }; base: { sha: string }; merge_commit_sha: string | null }
type File = { filename: string; additions: number; deletions: number; patch?: string }
type Review = { id: number; state: string; submitted_at: string | null }
type CheckSuite = { id: number }
type CheckRun = { id: number; name: string; status: string; conclusion: string | null }

export async function collectPullRequestContext(input: {
  url: string; installationId: string; repositoryId: string; expectedFullName: string; signal?: AbortSignal
}): Promise<CollectedPullRequestContext> {
  const parsed = parseGitHubPrUrl(input.url)
  if (!parsed.ok) throw new Error(parsed.error)
  const fullName = `${parsed.data.owner}/${parsed.data.repo}`
  if (fullName.toLowerCase() !== input.expectedFullName.toLowerCase()) throw new Error('Pull request repository binding mismatch.')
  const { token } = await createInstallationToken(input)
  const number = parsed.data.pullNumber
  const pr = await githubJson<Pr>(`/repos/${fullName}/pulls/${number}`, { token, signal: input.signal })
  const filesResult = await githubPaginate<File>(`/repos/${fullName}/pulls/${number}/files?per_page=100`, { token, signal: input.signal, maxItems: 3_000 })
  const reviewsResult = await githubPaginate<Review>(`/repos/${fullName}/pulls/${number}/reviews?per_page=100`, { token, signal: input.signal, maxItems: 5_000 })
  const suitesResult = await githubPaginate<CheckSuite>(`/repos/${fullName}/commits/${pr.head.sha}/check-suites?per_page=100`, { token, signal: input.signal, maxItems: 1_000 })
  const checks: PullRequestCheck[] = []
  let checksComplete = suitesResult.complete
  for (const suite of suitesResult.items) {
    const result = await githubPaginate<CheckRun>(`/repos/${fullName}/check-suites/${suite.id}/check-runs?filter=all&per_page=100`, { token, signal: input.signal, maxItems: 5_000 - checks.length })
    checks.push(...result.items.map((check) => ({ id: String(check.id), name: check.name.slice(0, 300), status: check.status, conclusion: check.conclusion })))
    if (!result.complete || checks.length >= 5_000) { checksComplete = false; break }
  }
  const changedFiles = filesResult.items.map((file) => file.filename)
  let diff = filesResult.items.map((file) => file.patch ?? '').filter(Boolean).join('\n\n---\n\n')
  if (diff.length > 50_000) diff = `${diff.slice(0, 50_000)}\n...[diff bounded]`
  const diagnostics: string[] = []
  const fileListComplete = filesResult.complete && pr.changed_files <= 3_000 && changedFiles.length >= pr.changed_files
  if (!fileListComplete) diagnostics.push('Pull request file list is incomplete or exceeded the 3,000-file GitHub cap.')
  if (!reviewsResult.complete) diagnostics.push('Pull request review collection reached its configured bound.')
  if (!checksComplete) diagnostics.push('Check suite/run collection is incomplete or reached a GitHub/configured cap.')
  return {
    title: pr.title, body: pr.body ?? '', changedFiles, diff,
    additions: filesResult.items.reduce((sum, file) => sum + Math.max(0, file.additions), 0),
    deletions: filesResult.items.reduce((sum, file) => sum + Math.max(0, file.deletions), 0),
    headSha: pr.head.sha.toLowerCase(), baseSha: pr.base.sha.toLowerCase(), mergedCommitSha: pr.merge_commit_sha?.toLowerCase() ?? null,
    fileListComplete, reviewsComplete: reviewsResult.complete, checksComplete,
    reviews: reviewsResult.items.map((review) => ({ id: String(review.id), state: review.state, submittedAt: review.submitted_at })),
    checks, diagnostics,
  }
}

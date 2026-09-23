import 'server-only'

const API_ROOT = process.env.GITHUB_API_ROOT ?? 'https://api.github.com'
const API_VERSION = process.env.GITHUB_API_VERSION ?? '2022-11-28'

export class GitHubApiError extends Error {
  constructor(public readonly status: number, public readonly transient: boolean) {
    super(`GitHub API request failed (${status}).`)
    this.name = 'GitHubApiError'
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}

export type GitHubResponseTelemetry = {
  limit: number | null
  remaining: number | null
  resetAt: number | null
  resource: string | null
  etag: string | null
}

export async function githubAppFetch(pathOrUrl: string, input: {
  token: string
  signal?: AbortSignal
  accept?: string
  attempts?: number
}): Promise<{ response: Response; telemetry: GitHubResponseTelemetry }> {
  const url = pathOrUrl.startsWith('https://api.github.com/') || (API_ROOT !== 'https://api.github.com' && pathOrUrl.startsWith(`${API_ROOT}/`)) ? pathOrUrl : `${API_ROOT}${pathOrUrl}`
  const maxAttempts = input.attempts ?? 4
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const timeout = AbortSignal.timeout(20_000)
      const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout
      const response = await fetch(url, {
        signal,
        headers: {
          Accept: input.accept ?? 'application/vnd.github+json',
          Authorization: `Bearer ${input.token}`,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': process.env.APP_CODE_VERSION ? `nexus-forge/${process.env.APP_CODE_VERSION}` : 'nexus-forge/dev',
        },
      })
      const telemetry = {
        limit: numberHeader(response, 'x-ratelimit-limit'),
        remaining: numberHeader(response, 'x-ratelimit-remaining'),
        resetAt: numberHeader(response, 'x-ratelimit-reset'),
        resource: response.headers.get('x-ratelimit-resource'),
        etag: response.headers.get('etag'),
      }
      if (response.ok) return { response, telemetry }
      const retryable = response.status === 429 || response.status >= 500 ||
        (response.status === 403 && (telemetry.remaining === 0 || response.headers.has('retry-after')))
      if (!retryable || attempt === maxAttempts) throw new GitHubApiError(response.status, retryable)
      const retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1000
      const resetDelay = telemetry.remaining === 0 && telemetry.resetAt
        ? Math.max(0, telemetry.resetAt * 1000 - Date.now()) : 0
      await delay(Math.min(60_000, Math.max(retryAfter, resetDelay, 500 * 2 ** (attempt - 1)) + Math.random() * 250), input.signal)
    } catch (error) {
      if (input.signal?.aborted) throw input.signal.reason ?? error
      if (error instanceof GitHubApiError) throw error
      if (attempt === maxAttempts) throw new GitHubApiError(0, true)
      await delay(500 * 2 ** (attempt - 1) + Math.random() * 250, input.signal)
    }
  }
  throw new GitHubApiError(0, true)
}

function numberHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function githubJson<T>(pathOrUrl: string, input: Parameters<typeof githubAppFetch>[1]): Promise<T> {
  const { response } = await githubAppFetch(pathOrUrl, input)
  return response.json() as Promise<T>
}

export async function githubPaginate<T>(path: string, input: Parameters<typeof githubAppFetch>[1] & { maxItems: number }): Promise<{ items: T[]; complete: boolean }> {
  let url: string | null = path
  const items: T[] = []
  let complete = true
  while (url) {
    const { response } = await githubAppFetch(url, input)
    const page = await response.json() as T[]
    if (!Array.isArray(page)) throw new Error('GitHub paginated response was invalid.')
    for (const item of page) {
      if (items.length >= input.maxItems) { complete = false; break }
      items.push(item)
    }
    if (!complete) break
    url = nextLink(response.headers.get('link'))
  }
  return { items, complete }
}

function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (match?.[1]?.startsWith(API_ROOT)) return match[1]
  }
  return null
}

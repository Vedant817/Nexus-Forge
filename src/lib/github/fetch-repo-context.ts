import { parseGitHubRepoUrl, parseGitHubPrUrl } from '../security/url-safety'

interface GithubRepoResponse {
  name: string
  description: string | null
  default_branch: string
  stargazers_count: number
  language: string | null
}

interface GithubContentItem {
  name: string
  type: string
  path: string
}

interface GithubFileItem {
  filename: string
  additions: number
  deletions: number
  patch?: string
}

interface GithubReadmeResponse {
  content: string
  encoding: string
}

interface GithubWorkflowItem {
  name: string
  path: string
  state: string
}

interface GithubPRResponse {
  title: string
  body: string | null
}

const GITHUB_API = 'https://api.github.com'

type GitHubFetchOptions = { timeout?: number; signal?: AbortSignal }

async function githubFetch(path: string, options: GitHubFetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'nexus-forge/1.0',
  }
  const controller = new AbortController()
  const timeout = options?.timeout ?? 15_000
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
    const res = await fetch(`${GITHUB_API}${path}`, { headers, signal })
    if (res.status === 403) {
      const resetTime = res.headers.get('X-RateLimit-Reset')
      throw new Error(`GitHub API rate limit hit. Resets at ${resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : 'unknown'}`)
    }
    if (res.status === 404) {
      throw new Error('GitHub repository not found')
    }
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

export interface RepoContext {
  name: string
  description: string
  defaultBranch: string
  stars: number
  language: string | null
  readme: string
  tree: string[]
  packageJson?: string
  requirementsTxt?: string
  pyprojectToml?: string
  dockerfile?: string
  dockerCompose?: string
  githubWorkflows: string[]
  envExample?: string
  commitSha?: string
  complete?: boolean
  diagnostics?: string[]
}

export async function fetchRepoContext(url: string, options: GitHubFetchOptions = {}): Promise<RepoContext> {
  const parsed = parseGitHubRepoUrl(url)
  if (!parsed.ok) throw new Error(parsed.error)

  const { owner, repo } = parsed.data

  const repoRes = await githubFetch(`/repos/${owner}/${repo}`, options)
  const repoData = await repoRes.json() as GithubRepoResponse

  const contentsRes = await githubFetch(`/repos/${owner}/${repo}/contents/`, options)
  const contents = await contentsRes.json() as GithubContentItem[]

  const tree: string[] = contents.map((item: GithubContentItem) => item.name)

  let readme = ''
  try {
    const readmeRes = await githubFetch(`/repos/${owner}/${repo}/readme`, options)
    const readmeData = await readmeRes.json() as GithubReadmeResponse
    readme = Buffer.from(readmeData.content, 'base64').toString('utf-8')
  } catch (error) {
    if (options.signal?.aborted) throw error
  }

  async function fetchFile(path: string): Promise<string | undefined> {
    try {
      const res = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, options)
      const data = await res.json() as { content?: string, encoding?: string }
      if (data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
    }
    return undefined
  }

  const importantFiles = ['package.json', 'requirements.txt', 'pyproject.toml', 'Dockerfile', 'docker-compose.yml', '.env.example']
  const [packageJson, requirementsTxt, pyprojectToml, dockerfile, dockerCompose, envExample] =
    await Promise.all(importantFiles.map(f => fetchFile(f)))

  let githubWorkflows: string[] = []
  try {
    const workflowsRes = await githubFetch(`/repos/${owner}/${repo}/contents/.github/workflows`, options)
    const workflows = await workflowsRes.json() as GithubWorkflowItem[]
    if (Array.isArray(workflows)) {
      githubWorkflows = workflows.map((w: GithubWorkflowItem) => w.name)
    }
  } catch (error) {
    if (options.signal?.aborted) throw error
  }

  return {
    name: repoData.name,
    description: repoData.description || '',
    defaultBranch: repoData.default_branch,
    stars: repoData.stargazers_count ?? 0,
    language: repoData.language,
    readme,
    tree,
    packageJson,
    requirementsTxt,
    pyprojectToml,
    dockerfile,
    dockerCompose,
    githubWorkflows,
    envExample,
  }
}

export interface PRContext {
  title: string
  body: string
  changedFiles: string[]
  diff: string
  additions: number
  deletions: number
  headSha?: string
  baseSha?: string
  mergedCommitSha?: string | null
  fileListComplete?: boolean
  reviewsComplete?: boolean
  checksComplete?: boolean
  reviews?: Array<{ id: string; state: string; submittedAt: string | null }>
  checks?: Array<{ id: string; name: string; status: string; conclusion: string | null }>
  diagnostics?: string[]
}

export async function fetchPRContext(url: string, options: GitHubFetchOptions = {}): Promise<PRContext> {
  const parsed = parseGitHubPrUrl(url)
  if (!parsed.ok) throw new Error(parsed.error)

  const { owner, repo, pullNumber } = parsed.data

  const prRes = await githubFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}`, options)
  const prData = await prRes.json() as GithubPRResponse

  const filesRes = await githubFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`, options)
  const files = await filesRes.json() as GithubFileItem[]

  const changedFiles = files.map((f: GithubFileItem) => f.filename)
  const additions = files.reduce((sum: number, f: GithubFileItem) => sum + (f.additions ?? 0), 0)
  const deletions = files.reduce((sum: number, f: GithubFileItem) => sum + (f.deletions ?? 0), 0)

  let allDiffs = files.map((f: GithubFileItem) => f.patch || '').filter(Boolean).join('\n\n---\n\n')
  if (allDiffs.length > 50000) {
    allDiffs = allDiffs.substring(0, 50000) + '\n\n...[Diff truncated due to size limit]...'
  }

  return {
    title: prData.title ?? '',
    body: prData.body ?? '',
    changedFiles,
    diff: allDiffs,
    additions,
    deletions,
  }
}

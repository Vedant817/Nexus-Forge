import { parseGitHubRepoUrl, parseGitHubPrUrl } from '../security/url-safety'
import config from '../config/env'

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
  size?: number
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

async function githubFetch(path: string, options?: { timeout?: number }): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'hermes-forge/1.0',
  }
  if (config.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${config.GITHUB_TOKEN}`
  }
  const controller = new AbortController()
  const timeout = options?.timeout ?? 15_000
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers, signal: controller.signal })
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


async function fetchRepoTree(owner: string, repo: string, branch: string): Promise<string[]> {
  try {
    const treeRes = await githubFetch(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
    const data = await treeRes.json() as { tree?: { path: string; type: string }[] }
    return (data.tree || [])
      .filter(item => item.type === 'blob')
      .map(item => item.path)
      .filter(path => shouldIncludePath(path))
      .slice(0, 500)
  } catch {
    const contentsRes = await githubFetch(`/repos/${owner}/${repo}/contents/`)
    const contents = await contentsRes.json() as GithubContentItem[]
    return contents.map(item => item.path || item.name)
  }
}

function shouldIncludePath(path: string): boolean {
  return /^(src|app|pages|lib|components|test|tests|__tests__|spec|\.github\/workflows)\//.test(path)
    || isConfigFile(path)
    || /(auth|security|middleware|proxy)/i.test(path)
}

function isConfigFile(path: string): boolean {
  return /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|Dockerfile|docker-compose\.ya?ml|\.env\.example|tsconfig\.json|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s|\.eslintrc|\.prettierrc|playwright\.config\.[cm]?[jt]s)$/i.test(path)
}

function selectImportantFiles(tree: string[]): string[] {
  const exact = ['package.json', 'requirements.txt', 'pyproject.toml', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.env.example']
  const rootFiles = exact.filter(file => tree.includes(file))
  const deeperEvidence = tree
    .filter(path => shouldIncludePath(path))
    .filter(path => /\.(json|ya?ml|toml|txt|md|[cm]?[jt]sx?|py|go|rs)$/i.test(path))
    .slice(0, 40)
  return [...new Set([...rootFiles, ...deeperEvidence])]
}

export interface RepoContext {
  name: string
  description: string
  defaultBranch: string
  stars: number
  language: string | null
  readme: string
  tree: string[]
  inspectedFiles: string[]
  configFiles: string[]
  testFiles: string[]
  securityFiles: string[]
  packageJson?: string
  requirementsTxt?: string
  pyprojectToml?: string
  dockerfile?: string
  dockerCompose?: string
  githubWorkflows: string[]
  envExample?: string
}

export async function fetchRepoContext(url: string): Promise<RepoContext> {
  const parsed = parseGitHubRepoUrl(url)
  if (!parsed.ok) throw new Error(parsed.error)

  const { owner, repo } = parsed.data

  const repoRes = await githubFetch(`/repos/${owner}/${repo}`)
  const repoData = await repoRes.json() as GithubRepoResponse

  const tree = await fetchRepoTree(owner, repo, repoData.default_branch)
  const configFiles = tree.filter(path => isConfigFile(path))
  const testFiles = tree.filter(path => /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(path))
  const securityFiles = tree.filter(path => /(auth|security|middleware|proxy|csrf|cors|permission|policy|secret)/i.test(path))

  let readme = ''
  try {
    const readmeRes = await githubFetch(`/repos/${owner}/${repo}/readme`)
    const readmeData = await readmeRes.json() as GithubReadmeResponse
    readme = Buffer.from(readmeData.content, 'base64').toString('utf-8')
  } catch { }

  async function fetchFile(path: string): Promise<string | undefined> {
    try {
      const res = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`)
      const data = await res.json() as { content?: string, encoding?: string }
      if (data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
    } catch { }
    return undefined
  }

  const importantFiles = selectImportantFiles(tree)
  const importantFileContents = await Promise.all(importantFiles.map(f => fetchFile(f)))
  const importantContent = Object.fromEntries(importantFiles.map((file, index) => [file, importantFileContents[index]]))
  const packageJson = importantContent['package.json']
  const requirementsTxt = importantContent['requirements.txt']
  const pyprojectToml = importantContent['pyproject.toml']
  const dockerfile = importantContent['Dockerfile']
  const dockerCompose = importantContent['docker-compose.yml'] || importantContent['docker-compose.yaml']
  const envExample = importantContent['.env.example']

  let githubWorkflows: string[] = []
  try {
    const workflowsRes = await githubFetch(`/repos/${owner}/${repo}/contents/.github/workflows`)
    const workflows = await workflowsRes.json() as GithubWorkflowItem[]
    if (Array.isArray(workflows)) {
      githubWorkflows = workflows.map((w: GithubWorkflowItem) => w.path || w.name)
    }
  } catch { }

  return {
    name: repoData.name,
    description: repoData.description || '',
    defaultBranch: repoData.default_branch,
    stars: repoData.stargazers_count ?? 0,
    language: repoData.language,
    readme,
    tree,
    inspectedFiles: importantFiles,
    configFiles,
    testFiles,
    securityFiles,
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
}

export async function fetchPRContext(url: string): Promise<PRContext> {
  const parsed = parseGitHubPrUrl(url)
  if (!parsed.ok) throw new Error(parsed.error)

  const { owner, repo, pullNumber } = parsed.data

  const prRes = await githubFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}`)
  const prData = await prRes.json() as GithubPRResponse

  const filesRes = await githubFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`)
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

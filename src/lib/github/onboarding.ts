import 'server-only'

import { auth } from '@/lib/auth'
import prisma from '@/lib/db/prisma'
import { createGitHubAppJwt } from '@/lib/github/app-auth'
import { githubJson } from '@/lib/github/http'

const MAX_INSTALLATIONS = 1_000
const MAX_REPOSITORIES = 5_000
const REQUIRED_PERMISSIONS = ['contents', 'pull_requests', 'checks'] as const

type GitHubAccount = { id: number; login: string; type: string }
type GitHubInstallation = {
  id: number
  app_id: number
  account: GitHubAccount
  repository_selection: string
  permissions: Record<string, string>
  suspended_at: string | null
}
type GitHubRepository = {
  id: number
  full_name: string
  private: boolean
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean }
}

export type GitHubAuthority = {
  accessToken: string
  githubUserId: string
  installationId: string
  account: { id: string; login: string; type: string }
  repositorySelection: string
  installationPermissions: Record<string, string>
}

export type AuthorizedGitHubRepository = {
  id: string
  fullName: string
  private: boolean
  permissions: NonNullable<GitHubRepository['permissions']>
}

export function parseGitHubId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('GitHub identifier is invalid.')
  const number = Number(value)
  if (!Number.isSafeInteger(number) || String(number) !== value) {
    throw new Error('GitHub identifier is outside the supported safe-integer range.')
  }
  return number
}

async function pagedCollection<T>(
  path: string,
  key: string,
  token: string,
  maxItems: number,
): Promise<T[]> {
  const collected: T[] = []
  for (let page = 1; collected.length < maxItems; page += 1) {
    const separator = path.includes('?') ? '&' : '?'
    const body = await githubJson<Record<string, unknown>>(`${path}${separator}per_page=100&page=${page}`, { token })
    const batch = body[key]
    if (!Array.isArray(batch)) throw new Error('GitHub returned an invalid paginated response.')
    collected.push(...batch as T[])
    if (batch.length < 100) return collected
  }
  throw new Error('GitHub result exceeds the supported onboarding bound.')
}

export async function getGitHubUserIdentity(headers: Headers, nexusUserId: string): Promise<{ token: string; githubUserId: string }> {
  const accounts = await prisma.account.findMany({
    where: { userId: nexusUserId, providerId: 'github' },
    select: { accountId: true },
    take: 2,
  })
  if (accounts.length !== 1) throw new Error('Exactly one GitHub login must be linked to connect repositories.')
  const token = await auth.api.getAccessToken({
    headers,
    body: { providerId: 'github', accountId: accounts[0].accountId },
  })
  const githubUser = await githubJson<{ id: number }>('/user', { token: token.accessToken })
  if (String(githubUser.id) !== accounts[0].accountId) throw new Error('GitHub login identity did not match the linked account.')
  return { token: token.accessToken, githubUserId: accounts[0].accountId }
}

export async function getGitHubAppMetadata(): Promise<{ id: string; clientId: string; slug: string }> {
  const app = await githubJson<{ id: number; client_id: string; slug: string }>('/app', { token: createGitHubAppJwt() })
  if (!app.slug || !app.client_id) throw new Error('GitHub App metadata is incomplete.')
  if (!process.env.GITHUB_CLIENT_ID || app.client_id !== process.env.GITHUB_CLIENT_ID) {
    throw new Error('GitHub login must use the same GitHub App configured for repository collection.')
  }
  if (String(app.id) !== process.env.GITHUB_APP_ID) throw new Error('GitHub App identity mismatch.')
  return { id: String(app.id), clientId: app.client_id, slug: app.slug }
}

function assertInstallationPermissions(permissions: Record<string, string>): void {
  for (const permission of REQUIRED_PERMISSIONS) {
    if (!['read', 'write'].includes(permissions[permission] ?? '')) {
      throw new Error(`GitHub App installation is missing ${permission} access.`)
    }
  }
}

export async function verifyGitHubInstallationAuthority(input: {
  headers: Headers
  nexusUserId: string
  installationId: string
}): Promise<GitHubAuthority> {
  const installationNumber = parseGitHubId(input.installationId)
  const [{ token, githubUserId }, app] = await Promise.all([
    getGitHubUserIdentity(input.headers, input.nexusUserId),
    getGitHubAppMetadata(),
  ])
  const userInstallations = await pagedCollection<GitHubInstallation>('/user/installations', 'installations', token, MAX_INSTALLATIONS)
  const userInstallation = userInstallations.find((candidate) => candidate.id === installationNumber)
  if (!userInstallation) throw new Error('The signed-in GitHub user is not authorized for this installation.')
  const appInstallation = await githubJson<GitHubInstallation>(`/app/installations/${installationNumber}`, { token: createGitHubAppJwt() })
  if (String(appInstallation.app_id) !== app.id || String(userInstallation.app_id) !== app.id) throw new Error('GitHub installation belongs to a different App.')
  if (appInstallation.suspended_at || userInstallation.suspended_at) throw new Error('GitHub installation is suspended.')
  if (String(appInstallation.account.id) !== String(userInstallation.account.id) || appInstallation.account.type !== userInstallation.account.type) {
    throw new Error('GitHub installation account identity mismatch.')
  }
  assertInstallationPermissions(appInstallation.permissions)
  return {
    accessToken: token,
    githubUserId,
    installationId: String(installationNumber),
    account: {
      id: String(appInstallation.account.id),
      login: appInstallation.account.login,
      type: appInstallation.account.type,
    },
    repositorySelection: appInstallation.repository_selection,
    installationPermissions: appInstallation.permissions,
  }
}

export async function listAuthorizedGitHubRepositories(authority: GitHubAuthority): Promise<AuthorizedGitHubRepository[]> {
  const repositories = await pagedCollection<GitHubRepository>(
    `/user/installations/${encodeURIComponent(authority.installationId)}/repositories`,
    'repositories',
    authority.accessToken,
    MAX_REPOSITORIES,
  )
  return repositories
    .filter((repository) => repository.permissions?.admin === true)
    .map((repository) => ({
      id: String(repository.id),
      fullName: repository.full_name,
      private: repository.private,
      permissions: repository.permissions ?? {},
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function verifyAuthorizedGitHubRepository(
  authority: GitHubAuthority,
  repositoryId: string,
): Promise<AuthorizedGitHubRepository> {
  parseGitHubId(repositoryId)
  const repository = (await listAuthorizedGitHubRepositories(authority)).find((candidate) => candidate.id === repositoryId)
  if (!repository) throw new Error('Repository administrator authority is required to connect this repository.')
  return repository
}

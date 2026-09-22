import 'server-only'

import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { contentHash } from '@/lib/execution/hash'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { hasBlockingFinding, isExcludedPath, isHighRiskPath, scanSecretContent, SECRET_SCANNER_VERSION } from '@/lib/security/secret-scanner'
import { createInstallationToken } from './app-auth'
import { githubJson } from './http'

export const GITHUB_SNAPSHOT_COLLECTOR_VERSION = 'github-rest-fixed-sha-v1'
const MAX_ENTRIES = 50_000
const MAX_SOURCE_FILES = 5_000
const MAX_FILE_BYTES = 1_048_576
const MAX_TOTAL_BYTES = 25 * 1_048_576
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|md|css|scss|html|py|go|rs|java|kt|rb|php|sh)$/i
const IMPORTANT_NAMES = /(?:^|\/)(?:Dockerfile|docker-compose\.ya?ml|\.env\.example|requirements\.txt|pyproject\.toml|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i

type TreeEntry = { path: string; mode: string; type: 'blob' | 'tree' | 'commit'; sha: string; size?: number }
type TreeResponse = { sha: string; tree: TreeEntry[]; truncated: boolean }
type RepoResponse = { id: number; full_name: string; default_branch: string }
type RefResponse = { object: { sha: string } }
type CommitResponse = { sha: string; tree: { sha: string } }
type BlobResponse = { content?: string; encoding?: string; size?: number }

export type CollectedRepositoryFile = {
  path: string; mode: string; objectType: string; blobSha?: string; size?: number
  status: string; language?: string; content?: string; contentHash?: string; diagnostic?: string
}

export type CollectedRepositorySnapshot = {
  repositoryFullName: string
  commitSha: string
  treeSha: string
  complete: boolean
  truncated: boolean
  diagnostics: string[]
  entries: TreeEntry[]
  files: CollectedRepositoryFile[]
  decodedBytes: number
}

function safePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').some((part) => part === '..')) {
    throw new Error('GitHub returned an unsafe repository path.')
  }
  return normalized
}

async function collectTree(fullName: string, treeSha: string, token: string, signal?: AbortSignal): Promise<{ entries: TreeEntry[]; truncated: boolean; complete: boolean; diagnostics: string[] }> {
  const recursive = await githubJson<TreeResponse>(`/repos/${fullName}/git/trees/${treeSha}?recursive=1`, { token, signal })
  const diagnostics: string[] = []
  let raw: TreeEntry[] = recursive.tree
  const truncated = recursive.truncated
  let complete = true
  if (recursive.truncated) {
    diagnostics.push('Recursive Git tree response was truncated; traversed subtrees individually.')
    raw = []
    const queue: Array<{ sha: string; prefix: string }> = [{ sha: treeSha, prefix: '' }]
    const visited = new Set<string>()
    while (queue.length && raw.length < MAX_ENTRIES) {
      const current = queue.shift()!
      if (visited.has(current.sha)) continue
      visited.add(current.sha)
      const page = await githubJson<TreeResponse>(`/repos/${fullName}/git/trees/${current.sha}`, { token, signal })
      for (const item of page.tree) {
        const path = safePath(current.prefix ? `${current.prefix}/${item.path}` : item.path)
        const entry = { ...item, path }
        raw.push(entry)
        if (item.type === 'tree') queue.push({ sha: item.sha, prefix: path })
        if (raw.length >= MAX_ENTRIES) break
      }
    }
    if (queue.length) { complete = false; diagnostics.push('Repository tree exceeded the 50,000-entry collection bound.') }
  }
  if (raw.length > MAX_ENTRIES) { raw = raw.slice(0, MAX_ENTRIES); complete = false; diagnostics.push('Repository tree exceeded the 50,000-entry collection bound.') }
  return { entries: raw.map((entry) => ({ ...entry, path: safePath(entry.path) })), truncated, complete, diagnostics }
}

export async function collectRepositorySnapshot(input: {
  installationId: string
  repositoryId: string
  expectedFullName?: string
  ref?: string
  pinnedCommitSha?: string
  excludedPaths?: string[]
  signal?: AbortSignal
}): Promise<CollectedRepositorySnapshot> {
  const { token } = await createInstallationToken(input)
  const repository = await githubJson<RepoResponse>(`/repositories/${encodeURIComponent(input.repositoryId)}`, { token, signal: input.signal })
  if (String(repository.id) !== input.repositoryId) throw new Error('GitHub repository identity mismatch.')
  if (input.expectedFullName && repository.full_name.toLowerCase() !== input.expectedFullName.toLowerCase()) throw new Error('GitHub repository name mismatch.')

  let commitSha = input.pinnedCommitSha
  if (!commitSha) {
    const ref = input.ref ?? repository.default_branch
    const resolved = await githubJson<RefResponse>(`/repos/${repository.full_name}/git/ref/heads/${encodeURIComponent(ref)}`, { token, signal: input.signal })
    commitSha = resolved.object.sha
  }
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error('GitHub returned an invalid commit SHA.')
  commitSha = commitSha.toLowerCase()
  const commit = await githubJson<CommitResponse>(`/repos/${repository.full_name}/git/commits/${commitSha}`, { token, signal: input.signal })
  const tree = await collectTree(repository.full_name, commit.tree.sha.toLowerCase(), token, input.signal)

  const files: CollectedRepositoryFile[] = []
  let decodedBytes = 0
  let sourceCount = 0
  for (const entry of tree.entries) {
    if (entry.type !== 'blob') {
      files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, status: entry.type === 'commit' ? 'submodule' : 'metadata' })
      continue
    }
    const size = entry.size
    if (entry.mode === '120000') { files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'symlink' }); continue }
    if (isExcludedPath(entry.path, input.excludedPaths)) { files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'excluded_by_policy' }); continue }
    if (isHighRiskPath(entry.path)) { tree.complete = false; files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'excluded_high_risk', diagnostic: `Excluded by ${SECRET_SCANNER_VERSION} path policy.` }); continue }
    const eligible = SOURCE_EXTENSIONS.test(entry.path) || IMPORTANT_NAMES.test(entry.path)
    if (!eligible) { files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'not_collected' }); continue }
    if (sourceCount >= MAX_SOURCE_FILES) { tree.complete = false; files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'bounded', diagnostic: 'Source file count bound reached.' }); continue }
    if (size !== undefined && size > MAX_FILE_BYTES) { tree.complete = false; files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'oversize' }); continue }
    if (decodedBytes >= MAX_TOTAL_BYTES) { tree.complete = false; files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'bounded', diagnostic: 'Decoded byte bound reached.' }); continue }
    const blob = await githubJson<BlobResponse>(`/repos/${repository.full_name}/git/blobs/${entry.sha}`, { token, signal: input.signal })
    if (blob.encoding !== 'base64' || !blob.content) { tree.complete = false; files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size, status: 'unavailable' }); continue }
    const decoded = Buffer.from(blob.content.replace(/\s/g, ''), 'base64')
    if (decoded.length > MAX_FILE_BYTES || decodedBytes + decoded.length > MAX_TOTAL_BYTES) { tree.complete = false; files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size: decoded.length, status: 'oversize' }); continue }
    const rawContent = decoded.toString('utf8')
    const findings = scanSecretContent(rawContent, entry.path)
    if (hasBlockingFinding(findings)) {
      tree.complete = false
      files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size: decoded.length, status: 'quarantined', diagnostic: `Quarantined by ${SECRET_SCANNER_VERSION}: ${[...new Set(findings.map((finding) => finding.kind))].join(',').slice(0, 200)}` })
      continue
    }
    const content = redactSecrets(rawContent)
    decodedBytes += decoded.length
    sourceCount += 1
    files.push({ path: entry.path, mode: entry.mode, objectType: entry.type, blobSha: entry.sha, size: decoded.length, status: 'collected', language: extension(entry.path), content, contentHash: contentHash(content) })
  }
  return {
    repositoryFullName: repository.full_name.toLowerCase(), commitSha, treeSha: commit.tree.sha.toLowerCase(),
    complete: tree.complete, truncated: tree.truncated, diagnostics: tree.diagnostics,
    entries: tree.entries, files, decodedBytes,
  }
}

function extension(path: string): string | undefined {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1]
}

export function repositoryContextFromSnapshot(snapshot: CollectedRepositorySnapshot) {
  const byPath = new Map(snapshot.files.filter((file) => file.content !== undefined).map((file) => [file.path.toLowerCase(), file.content!]))
  const workflowNames = snapshot.files
    .filter((file) => file.path.toLowerCase().startsWith('.github/workflows/') && file.status === 'collected')
    .map((file) => file.path.split('/').pop()!)
  return {
    name: snapshot.repositoryFullName.split('/')[1] ?? snapshot.repositoryFullName,
    description: '', defaultBranch: '', stars: 0, language: null,
    readme: byPath.get('readme.md') ?? byPath.get('readme') ?? '',
    tree: snapshot.entries.map((entry) => entry.path),
    packageJson: byPath.get('package.json'), requirementsTxt: byPath.get('requirements.txt'),
    pyprojectToml: byPath.get('pyproject.toml'), dockerfile: byPath.get('dockerfile'),
    dockerCompose: byPath.get('docker-compose.yml') ?? byPath.get('docker-compose.yaml'),
    githubWorkflows: workflowNames, envExample: byPath.get('.env.example'),
    commitSha: snapshot.commitSha, complete: snapshot.complete, diagnostics: snapshot.diagnostics,
  }
}

export async function persistRepositorySnapshot(input: {
  projectId: string
  analysisRunId: string
  installationId: string
  repositoryId: string
  snapshot: CollectedRepositorySnapshot
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.analysisRun.updateMany({
      where: { id: input.analysisRunId, projectId: input.projectId, status: { in: ['QUEUED', 'RUNNING'] }, OR: [{ commitSha: null }, { commitSha: input.snapshot.commitSha }] },
      data: { commitSha: input.snapshot.commitSha },
    })
    if (run.count !== 1) throw new Error('Analysis run commit pin changed or run is no longer executable.')
    await tx.repositorySnapshot.create({
      data: {
        projectId: input.projectId, analysisRunId: input.analysisRunId,
        installationId: input.installationId, repositoryId: input.repositoryId,
        repositoryFullName: input.snapshot.repositoryFullName, commitSha: input.snapshot.commitSha,
        treeSha: input.snapshot.treeSha, collectorVersion: GITHUB_SNAPSHOT_COLLECTOR_VERSION,
        complete: input.snapshot.complete, truncated: input.snapshot.truncated,
        diagnostics: input.snapshot.diagnostics as Prisma.InputJsonValue,
        entryCount: input.snapshot.entries.length,
        sourceFileCount: input.snapshot.files.filter((file) => file.status === 'collected').length,
        decodedBytes: input.snapshot.decodedBytes, observedAt: new Date(),
        files: { create: input.snapshot.files },
      },
    })
  })
}

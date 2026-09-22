import { contentHash } from '@/lib/execution/hash'
import { redactStructuredValue } from '@/lib/security/secret-redaction'
import type { PRContext, RepoContext } from '@/lib/github/fetch-repo-context'
import type { EvidenceInput, EvidenceView } from './types'
import { COLLECTOR_VERSION } from './registry'

export type RepositoryCollectorFacts = {
  rootPaths: string[]
  hasReadme: boolean
  hasManifest: boolean
  hasLockfile: boolean
  hasTests: boolean
  hasCi: boolean | null
  hasEnvExample: boolean
  hasContainer: boolean
  rootInventoryComplete: boolean
}

export type PullRequestCollectorFacts = {
  changedFiles: string[]
  changedFileCount: number
  hasTestChanges: boolean
  hasDocChanges: boolean
  additions: number
  deletions: number
  fileListComplete: boolean
  checksEvaluated?: boolean
  checksPassing?: boolean | null
  reviewsEvaluated?: boolean
  approvedReviewPresent?: boolean | null
  headSha?: string | null
}

export function repositoryFactsFromContext(context: RepoContext): RepositoryCollectorFacts {
  const normalizedRootPaths = [...new Set(context.tree.map((path) => path.replace(/\\/g, '/').slice(0, 500)))].sort()
  const rootPaths = normalizedRootPaths.slice(0, 1_000)
  const lower = rootPaths.map((path) => path.toLowerCase())
  const includes = (...names: string[]) => names.some((name) => lower.includes(name.toLowerCase()))
  const rootInventoryComplete = context.complete === true || (context.complete === undefined && normalizedRootPaths.length < 1_000)
  return {
    rootPaths,
    hasReadme: context.readme.trim().length > 0 || lower.some((path) => /^readme(?:\.|$)/.test(path)),
    hasManifest: Boolean(context.packageJson || context.requirementsTxt || context.pyprojectToml) || includes('package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'cargo.toml', 'pom.xml', 'build.gradle'),
    hasLockfile: includes('package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'poetry.lock', 'uv.lock', 'cargo.lock', 'go.sum'),
    hasTests: lower.some((path) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\.[a-z0-9]+$/.test(path)),
    hasCi: context.githubWorkflows.length > 0 ? true : !lower.includes('.github') && rootInventoryComplete ? false : null,
    hasEnvExample: Boolean(context.envExample) || includes('.env.example', '.env.sample'),
    hasContainer: Boolean(context.dockerfile || context.dockerCompose) || includes('dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'),
    rootInventoryComplete,
  }
}

export function pullRequestFactsFromContext(context: PRContext): PullRequestCollectorFacts {
  const changedFiles = [...new Set(context.changedFiles.map((path) => path.replace(/\\/g, '/').slice(0, 500)))].sort().slice(0, 3_000)
  return {
    changedFiles,
    changedFileCount: changedFiles.length,
    hasTestChanges: changedFiles.some((path) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\.[a-z0-9]+$/i.test(path)),
    hasDocChanges: changedFiles.some((path) => /(^|\/)(docs?)(\/|$)|(^|\/)readme(?:\.|$)|\.mdx?$/i.test(path)),
    additions: Math.max(0, context.additions),
    deletions: Math.max(0, context.deletions),
    fileListComplete: context.fileListComplete === true,
    checksEvaluated: context.checksComplete === true,
    checksPassing: context.checksComplete === true
      ? (context.checks?.length ? context.checks.every((check) => check.status === 'completed' && check.conclusion === 'success') : null)
      : null,
    reviewsEvaluated: context.reviewsComplete === true,
    approvedReviewPresent: context.reviewsComplete === true
      ? Boolean(context.reviews?.some((review) => review.state.toUpperCase() === 'APPROVED'))
      : null,
    headSha: context.headSha && /^[0-9a-f]{40}$/i.test(context.headSha) ? context.headSha.toLowerCase() : null,
  }
}

function view(input: EvidenceInput): EvidenceView {
  const facts = redactStructuredValue(input.facts)
  return {
    ...input,
    facts,
    id: input.stableEvidenceId,
    contentHash: contentHash({
      evidenceType: input.evidenceType,
      source: input.source,
      collectorId: input.collectorId,
      collectorVersion: input.collectorVersion,
      repositoryFullName: input.repositoryFullName ?? null,
      commitSha: input.commitSha ?? null,
      path: input.path ?? null,
      lineStart: input.lineStart ?? null,
      lineEnd: input.lineEnd ?? null,
      checkId: input.checkId ?? null,
      facts,
      provenance: input.provenance,
      confidence: input.confidence,
    }),
  }
}

export function collectRunEvidence(input: {
  observedAt: Date
  repositoryFullName?: string
  commitSha?: string
  project: { repoUrl: string; prUrl: string }
  sources: Array<{ id: string; type: string; title: string; contentHash?: string; byteCount?: number; contentType?: string }>
  inputHash?: string
  repositoryFacts?: RepositoryCollectorFacts
  pullRequestFacts?: PullRequestCollectorFacts
  repositoryFiles?: Array<{ path: string; contentHash: string }>
  proofArtifactHash?: string
}): EvidenceView[] {
  const common = { collectorVersion: COLLECTOR_VERSION, observedAt: input.observedAt }
  const records: EvidenceInput[] = [
    {
      ...common,
      stableEvidenceId: 'analysis:scope', evidenceType: 'analysis.scope', source: 'analysis-run-snapshot', collectorId: 'run-snapshot-scope',
      facts: { hasRepository: Boolean(input.project.repoUrl), hasPullRequest: Boolean(input.project.prUrl), sourceCount: input.sources.length },
      provenance: 'SOURCE_SNAPSHOT', confidence: 'HIGH',
    },
    {
      ...common,
      stableEvidenceId: 'pull-request:scope', evidenceType: 'pull_request.scope', source: input.project.prUrl || 'not-configured', collectorId: 'run-snapshot-scope',
      facts: { configured: Boolean(input.project.prUrl) }, provenance: 'SOURCE_SNAPSHOT', confidence: 'HIGH',
    },
  ]
  if (input.proofArtifactHash) {
    records.push({
      ...common,
      stableEvidenceId: 'proof:artifact', evidenceType: 'proof.artifact', source: 'artifact:PROOF', collectorId: 'durable-artifact-checkpoint',
      facts: { contentHash: input.proofArtifactHash, reviewRequired: true }, provenance: 'GENERATED_ARTIFACT', confidence: 'HIGH',
    })
  }

  for (const source of input.sources) {
    records.push({
      ...common,
      stableEvidenceId: `source:${source.id}`, evidenceType: 'source.snapshot', source: `source:${source.id}`,
      collectorId: 'run-input-snapshot',
      facts: {
        sourceId: source.id.slice(0, 200), type: source.type.slice(0, 100), title: source.title.slice(0, 500),
        contentHash: (source.contentHash ?? '').slice(0, 128), byteCount: source.byteCount ?? 0,
        contentType: (source.contentType ?? 'text').slice(0, 100), snapshotIdentity: (input.inputHash ?? '').slice(0, 128),
      },
      provenance: 'SOURCE_SNAPSHOT', confidence: 'HIGH',
    })
  }
  for (const file of input.repositoryFiles ?? []) {
    records.push({
      ...common, stableEvidenceId: `repository:file:${file.path}`, evidenceType: 'repository.file',
      source: input.project.repoUrl, collectorId: 'github-git-blob', repositoryFullName: input.repositoryFullName,
      commitSha: input.commitSha, path: file.path, facts: { contentHash: file.contentHash, parseEligible: true },
      provenance: 'REPOSITORY_SNAPSHOT', confidence: input.commitSha ? 'HIGH' : 'MEDIUM',
    })
  }
  if (input.repositoryFacts) {
    records.push({
      ...common,
      stableEvidenceId: 'repository:inventory', evidenceType: 'repository.inventory', source: input.project.repoUrl,
      collectorId: 'github-repository-context', repositoryFullName: input.repositoryFullName, commitSha: input.commitSha,
      facts: input.repositoryFacts, provenance: 'REPOSITORY_SNAPSHOT', confidence: input.commitSha ? 'HIGH' : 'MEDIUM',
    })
  }
  if (input.pullRequestFacts) {
    records.push({
      ...common,
      stableEvidenceId: 'pull-request:files', evidenceType: 'pull_request.files', source: input.project.prUrl,
      collectorId: 'github-pull-request-context', repositoryFullName: input.repositoryFullName, commitSha: input.pullRequestFacts.headSha ?? undefined,
      facts: input.pullRequestFacts, provenance: 'PULL_REQUEST_SNAPSHOT', confidence: input.pullRequestFacts.fileListComplete ? 'HIGH' : 'MEDIUM',
    })
    if (input.pullRequestFacts.checksEvaluated) records.push({
      ...common, stableEvidenceId: 'pull-request:checks', evidenceType: 'pull_request.checks', source: input.project.prUrl,
      collectorId: 'github-check-runs', repositoryFullName: input.repositoryFullName, commitSha: input.pullRequestFacts.headSha ?? undefined,
      facts: { evaluated: true, passing: input.pullRequestFacts.checksPassing }, provenance: 'PULL_REQUEST_SNAPSHOT', confidence: 'HIGH',
    })
    if (input.pullRequestFacts.reviewsEvaluated) records.push({
      ...common, stableEvidenceId: 'pull-request:reviews', evidenceType: 'pull_request.reviews', source: input.project.prUrl,
      collectorId: 'github-pull-request-reviews', repositoryFullName: input.repositoryFullName, commitSha: input.pullRequestFacts.headSha ?? undefined,
      facts: { evaluated: true, approved: input.pullRequestFacts.approvedReviewPresent }, provenance: 'PULL_REQUEST_SNAPSHOT', confidence: 'HIGH',
    })
  }
  return records.map(view)
}

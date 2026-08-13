import type { CriterionDefinition, CriterionEvaluation, EvidenceView, ScorecardKindValue } from './types'

export const SCORECARD_VERSION = 'evidence-scorecards-v1'
export const COLLECTOR_VERSION = '1.0.0'

function evidenceOf(evidence: readonly EvidenceView[], type: string): EvidenceView | undefined {
  return evidence.find((record) => record.evidenceType === type)
}

function factBoolean(record: EvidenceView | undefined, key: string): boolean | undefined {
  const value = record?.facts[key]
  return typeof value === 'boolean' ? value : undefined
}

function linked(record: EvidenceView | undefined, evaluation: Omit<CriterionEvaluation, 'evidenceStableIds'>): CriterionEvaluation {
  return { ...evaluation, evidenceStableIds: record ? [record.stableEvidenceId] : [] }
}

function analysisScope(evidence: readonly EvidenceView[]): EvidenceView | undefined {
  return evidenceOf(evidence, 'analysis.scope')
}

function repositoryNotApplicable(evidence: readonly EvidenceView[]): CriterionEvaluation | null {
  const scope = analysisScope(evidence)
  return factBoolean(scope, 'hasRepository') === false
    ? linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_REPOSITORY', reason: 'This run did not include a repository.' })
    : null
}

function presenceCriterion(input: {
  id: string
  title: string
  weight: number
  fact: string
  pass: string
  fail: string
}): CriterionDefinition {
  return {
    id: input.id,
    version: '1',
    title: input.title,
    description: `Deterministically evaluates repository fact ${input.fact}.`,
    weight: input.weight,
    requiredEvidenceTypes: ['repository.inventory'],
    evaluate(evidence) {
      const notApplicable = repositoryNotApplicable(evidence)
      if (notApplicable) return notApplicable
      const inventory = evidenceOf(evidence, 'repository.inventory')
      const value = factBoolean(inventory, input.fact)
      if (value === undefined || (value === false && factBoolean(inventory, 'rootInventoryComplete') !== true)) {
        return linked(inventory, { status: 'UNKNOWN', reasonCode: 'INVENTORY_INCOMPLETE', reason: 'The repository collector did not establish this fact with a complete root inventory.' })
      }
      return linked(inventory, value
        ? { status: 'PASS', reasonCode: 'OBSERVED_PRESENT', reason: input.pass }
        : { status: 'FAIL', reasonCode: 'OBSERVED_ABSENT', reason: input.fail })
    },
  }
}

const repositoryCriteria: CriterionDefinition[] = [
  {
    id: 'repo.commit-pinned', version: '1', title: 'Commit identity captured', description: 'Requires an immutable Git commit SHA for reproducible repository evidence.', weight: 20, requiredEvidenceTypes: ['repository.inventory'],
    evaluate(evidence) {
      const notApplicable = repositoryNotApplicable(evidence)
      if (notApplicable) return notApplicable
      const inventory = evidenceOf(evidence, 'repository.inventory')
      if (!inventory) return linked(analysisScope(evidence), { status: 'UNKNOWN', reasonCode: 'REPOSITORY_NOT_COLLECTED', reason: 'Repository evidence was not collected.' })
      if (!inventory.commitSha) return linked(inventory, { status: 'UNKNOWN', reasonCode: 'COMMIT_SHA_NOT_COLLECTED', reason: 'The repository collector did not capture an immutable commit SHA.' })
      return linked(inventory, { status: 'PASS', reasonCode: 'COMMIT_SHA_OBSERVED', reason: `Repository evidence is pinned to commit ${inventory.commitSha}.` })
    },
  },
  presenceCriterion({ id: 'repo.readme', title: 'README present', weight: 15, fact: 'hasReadme', pass: 'A repository README was collected.', fail: 'The README endpoint and root inventory established that no README is present.' }),
  presenceCriterion({ id: 'repo.manifest', title: 'Build manifest present', weight: 20, fact: 'hasManifest', pass: 'A supported package/build manifest is present.', fail: 'The complete root inventory contains no supported manifest.' }),
  presenceCriterion({ id: 'repo.lockfile', title: 'Dependency lockfile present', weight: 15, fact: 'hasLockfile', pass: 'A dependency lockfile is present.', fail: 'The complete root inventory contains no dependency lockfile.' }),
  {
    id: 'repo.tests', version: '1', title: 'Tests observed', description: 'Looks only for deterministically observed test paths.', weight: 20,
    requiredEvidenceTypes: ['repository.inventory'],
    evaluate(evidence) {
      const notApplicable = repositoryNotApplicable(evidence)
      if (notApplicable) return notApplicable
      const inventory = evidenceOf(evidence, 'repository.inventory')
      const hasTests = factBoolean(inventory, 'hasTests')
      if (hasTests === true) return linked(inventory, { status: 'PASS', reasonCode: 'TEST_PATH_OBSERVED', reason: 'At least one test path was observed.' })
      return linked(inventory, { status: 'UNKNOWN', reasonCode: 'NESTED_TREE_UNAVAILABLE', reason: 'No test path was observed, but the current collector does not enumerate every nested file.' })
    },
  },
  presenceCriterion({ id: 'repo.ci', title: 'CI workflow present', weight: 15, fact: 'hasCi', pass: 'At least one GitHub Actions workflow was collected.', fail: 'The repository inventory established that no GitHub Actions workflow is present.' }),
  presenceCriterion({ id: 'repo.env-example', title: 'Environment example present', weight: 5, fact: 'hasEnvExample', pass: 'An environment example file is present.', fail: 'The complete root inventory contains no environment example.' }),
  presenceCriterion({ id: 'repo.container', title: 'Container setup present', weight: 10, fact: 'hasContainer', pass: 'A Dockerfile or compose file is present.', fail: 'The complete root inventory contains no container setup.' }),
]

function prScope(evidence: readonly EvidenceView[]): EvidenceView | undefined {
  return evidenceOf(evidence, 'pull_request.scope')
}
function uncollectedPrCriterion(id: string, title: string, weight: number, evidenceType: string, reason: string): CriterionDefinition {
  return {
    id, version: '1', title, description: reason, weight, requiredEvidenceTypes: [evidenceType],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      return linked(evidenceOf(evidence, evidenceType) ?? scope, {
        status: 'UNKNOWN', reasonCode: 'SIGNAL_NOT_EVALUATED', reason,
      })
    },
  }
}

const releaseCriteria: CriterionDefinition[] = [
  {
    id: 'release.commit-pinned', version: '1', title: 'Pull request head commit captured', description: 'Requires an immutable pull-request head SHA.', weight: 20, requiredEvidenceTypes: ['pull_request.files'],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      const files = evidenceOf(evidence, 'pull_request.files')
      if (!files?.commitSha) return linked(files ?? scope, { status: 'UNKNOWN', reasonCode: 'COMMIT_SHA_NOT_COLLECTED', reason: 'The pull request collector did not capture the head commit SHA.' })
      return linked(files, { status: 'PASS', reasonCode: 'COMMIT_SHA_OBSERVED', reason: `Pull request evidence is pinned to commit ${files.commitSha}.` })
    },
  },
  {
    id: 'release.pr-snapshot', version: '1', title: 'Pull request snapshot collected', description: 'Requires persisted pull-request file evidence.', weight: 15, requiredEvidenceTypes: ['pull_request.files'],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      const files = evidenceOf(evidence, 'pull_request.files')
      if (!files) return linked(scope, { status: 'UNKNOWN', reasonCode: 'SIGNAL_NOT_COLLECTED', reason: 'Pull request file evidence was not collected.' })
      return linked(files, { status: 'PASS', reasonCode: 'SNAPSHOT_OBSERVED', reason: 'A bounded pull-request file snapshot was persisted.' })
    },
  },
  {
    id: 'release.tests-changed', version: '1', title: 'Test changes observed', description: 'Passes only when a test file is observed; absence is unknown because PR file pagination is not yet attested.', weight: 20, requiredEvidenceTypes: ['pull_request.files'],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      const files = evidenceOf(evidence, 'pull_request.files')
      if (factBoolean(files, 'hasTestChanges') === true) return linked(files, { status: 'PASS', reasonCode: 'TEST_CHANGE_OBSERVED', reason: 'A changed test file was observed.' })
      return linked(files, { status: 'UNKNOWN', reasonCode: 'TEST_RESULT_UNVERIFIED', reason: 'No changed test file was observed and test execution results were not collected.' })
    },
  },
  {
    id: 'release.checks', version: '2', title: 'Required checks passing', description: 'Uses commit-pinned check-run conclusions when collection is complete.', weight: 25, requiredEvidenceTypes: ['pull_request.checks'],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      const checks = evidenceOf(evidence, 'pull_request.checks')
      const passing = factBoolean(checks, 'passing')
      if (passing === true) return linked(checks, { status: 'PASS', reasonCode: 'CHECKS_PASSING', reason: 'All collected commit-pinned checks completed successfully.' })
      if (passing === false) return linked(checks, { status: 'FAIL', reasonCode: 'CHECKS_NOT_PASSING', reason: 'At least one collected commit-pinned check is incomplete or not successful.' })
      return linked(checks ?? scope, { status: 'UNKNOWN', reasonCode: checks ? 'SIGNAL_NOT_EVALUATED' : 'CHECKS_UNAVAILABLE', reason: 'Check-run conclusions were unavailable or incomplete.' })
    },
  },
  {
    id: 'release.review', version: '2', title: 'Approved review present', description: 'Uses the complete collected pull-request review list.', weight: 15, requiredEvidenceTypes: ['pull_request.reviews'],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      const reviews = evidenceOf(evidence, 'pull_request.reviews')
      const approved = factBoolean(reviews, 'approved')
      if (approved === true) return linked(reviews, { status: 'PASS', reasonCode: 'APPROVAL_OBSERVED', reason: 'At least one approved review was observed.' })
      if (approved === false) return linked(reviews, { status: 'FAIL', reasonCode: 'APPROVAL_NOT_OBSERVED', reason: 'The complete review list contains no approved review.' })
      return linked(reviews ?? scope, { status: 'UNKNOWN', reasonCode: reviews ? 'SIGNAL_NOT_EVALUATED' : 'REVIEWS_UNAVAILABLE', reason: 'Review collection was unavailable or incomplete.' })
    },
  },
  uncollectedPrCriterion('release.acceptance', 'Acceptance criteria verified', 15, 'pull_request.acceptance', 'Acceptance-criterion completion was not independently observed.'),
  {
    id: 'release.change-scope', version: '1', title: 'Changed-file scope observed', description: 'Passes when the collector observed at least one changed file.', weight: 10, requiredEvidenceTypes: ['pull_request.files'],
    evaluate(evidence) {
      const scope = prScope(evidence)
      if (factBoolean(scope, 'configured') === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_PULL_REQUEST', reason: 'This run did not include a pull request.' })
      const files = evidenceOf(evidence, 'pull_request.files')
      const count = files?.facts.changedFileCount
      if (typeof count !== 'number') return linked(files ?? scope, { status: 'UNKNOWN', reasonCode: 'FILES_NOT_COLLECTED', reason: 'Changed files were not collected.' })
      if (count > 0) return linked(files, { status: 'PASS', reasonCode: 'CHANGED_FILES_OBSERVED', reason: `${count} changed file(s) were observed.` })
      return linked(files, { status: 'UNKNOWN', reasonCode: 'EMPTY_OR_INCOMPLETE_FILE_LIST', reason: 'The collector observed no changed files but cannot attest the list is complete.' })
    },
  },
]

function proofScoped(id: string, title: string, weight: number, type: string, scopeFact?: string, requireCommit = false): CriterionDefinition {
  return {
    id, version: '1', title, description: `Requires persisted ${type} provenance.`, weight, requiredEvidenceTypes: [type],
    evaluate(evidence) {
      const scope = evidenceOf(evidence, 'analysis.scope')
      if (scopeFact && factBoolean(scope, scopeFact) === false) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'OUT_OF_SCOPE', reason: `${title} was outside this run's configured scope.` })
      const record = evidenceOf(evidence, type)
      if (record && requireCommit && !record.commitSha) return linked(record, { status: 'UNKNOWN', reasonCode: 'COMMIT_SHA_NOT_COLLECTED', reason: `${title} is not pinned to an immutable commit SHA.` })
      if (record) return linked(record, { status: 'PASS', reasonCode: 'PROVENANCE_OBSERVED', reason: `${title} has persisted deterministic provenance.` })
      return linked(scope, { status: 'UNKNOWN', reasonCode: 'PROVENANCE_NOT_OBSERVED', reason: `${title} provenance was not independently observed.` })
    },
  }
}

const proofCriteria: CriterionDefinition[] = [
  {
    id: 'proof.sources', version: '1', title: 'Source provenance', description: 'Requires persisted source snapshots when sources are in scope.', weight: 20, requiredEvidenceTypes: ['source.snapshot'],
    evaluate(evidence) {
      const scope = evidenceOf(evidence, 'analysis.scope')
      if (scope?.facts.sourceCount === 0) return linked(scope, { status: 'NOT_APPLICABLE', reasonCode: 'NO_INPUT_SOURCES', reason: 'No learning sources were configured for this run.' })
      const expectedCount = scope?.facts.sourceCount
      const sources = evidence.filter((record) => record.evidenceType === 'source.snapshot')
      if (typeof expectedCount === 'number' && expectedCount > 0 && sources.length === expectedCount) {
        return {
          status: 'PASS', reasonCode: 'PROVENANCE_OBSERVED',
          reason: `All ${expectedCount} source snapshot(s) have persisted provenance.`,
          evidenceStableIds: sources.map((record) => record.stableEvidenceId),
        }
      }
      return linked(scope, { status: 'UNKNOWN', reasonCode: 'PROVENANCE_INCOMPLETE', reason: 'Source provenance is absent or incomplete for the run snapshot.' })
    },
  },
  proofScoped('proof.repository', 'Repository provenance', 20, 'repository.inventory', 'hasRepository', true),
  proofScoped('proof.pull-request', 'Pull request provenance', 20, 'pull_request.files', 'hasPullRequest', true),
  proofScoped('proof.artifact', 'Review-ready artifact provenance', 20, 'proof.artifact'),
  proofScoped('proof.verification', 'Independent verification evidence', 20, 'verification.result'),
]

export const CRITERION_REGISTRIES: Readonly<Record<ScorecardKindValue, readonly CriterionDefinition[]>> = Object.freeze({
  REPOSITORY_MATURITY: repositoryCriteria,
  RELEASE_READINESS: releaseCriteria,
  PROOF_COMPLETENESS: proofCriteria,
})

# Evidence ledger and scorecards

Nexus Forge scorecards are deterministic summaries of persisted observations. Language models do not create evidence, decide criterion status, or assign numeric scores.

## Data model

Each successful analysis run may append:

- `EvidenceRecord`: a stable run-local evidence ID, collector and version, observation time, content hash, bounded structured facts, provenance, confidence, and optional repository/commit/path/line/check coordinates.
- `CriterionResult`: one versioned criterion evaluation with `PASS`, `FAIL`, `UNKNOWN`, or `NOT_APPLICABLE`, a deterministic reason code, weight, and explicit evidence links.
- `Scorecard`: a versioned repository-maturity, release-readiness, or proof-completeness rollup.

Ledger rows are immutable. A new collector or methodology creates a new analysis run/version rather than rewriting history. Compatibility score columns remain temporarily, but their `scoreStatus`, `scoreCompleteness`, and `scorecardVersion` fields must be read together.

## Status semantics

- **PASS**: deterministic collected facts prove the criterion.
- **FAIL**: a collector with adequate scope proves the requirement absent or violated.
- **UNKNOWN**: the signal was not collected, collection scope was incomplete, or evidence could not prove either outcome. Missing data is never silently treated as failure.
- **NOT_APPLICABLE**: deterministic run scope proves the criterion does not apply, such as release checks when no pull request was configured.

Numeric score is `round(passed weight / applicable weight * 100)`. Unknown weight remains in the applicable denominator. A score is `null` until at least 80% of applicable weight has a PASS/FAIL result. Completeness and status counts are always exposed.

## Provenance and confidence

`HIGH` means the fact came from an exact run input, immutable artifact, or an attested collector response. `MEDIUM` means the observation is useful but collection is known incomplete (for example, the current non-paginated PR-file list or repository data without a fixed commit SHA). `LOW` is reserved for weak deterministic signals and is not currently emitted by core collectors. Generated prose is never promoted to repository or verification evidence.

## Adding a collector or criterion

1. Add a bounded collector output in `src/lib/evidence/collectors.ts`. Do not store secrets, complete diffs, or arbitrary provider responses.
2. Give every observation a stable run-local ID, collector ID/version, content hash, and provenance.
3. Add a versioned definition to `src/lib/evidence/registry.ts` with required evidence types and explicit UNKNOWN/N/A behavior.
4. Add table-driven boundary tests. Test observed absence separately from missing collection.
5. Bump the scorecard/collector version when semantics change. Bump pipeline prompt/schema identity if a stage artifact shape changes.
6. Add migration changes additively. Deploy migrations before workers that write the new ledger. Do not rewrite old ledger rows.

## Current limitations

The current GitHub collector is not fixed to a commit SHA, does not attest complete recursive trees or PR-file pagination, and does not collect check runs, reviews, or independently executed acceptance criteria. Those criteria remain UNKNOWN. Proof and marketing text is review-required even when deterministic provenance exists.

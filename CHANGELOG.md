# Changelog

## Unreleased

### Added
- Better Auth GitHub sessions and owner-scoped authorization across project APIs.
- Raw-byte authenticated, replay-safe GitHub App webhooks and lifecycle reconciliation.
- Durable PostgreSQL analysis runs, stages, jobs, leases, cancellation, retries, and immutable artifact publication.
- Schema-validated AI SDK boundary with secret redaction, typed failures, model allowlisting, token budgets, and safe telemetry.
- Immutable deterministic evidence ledger and completeness-aware repository, release, and proof scorecards.
- Repository-scoped GitHub App installation tokens, fixed-SHA snapshots, PR pagination, checks/reviews, and explicit collection caps.
- Deterministic syntax-level JS/TS dependency maps with evidence links and active-run immutable artifacts.
- Disposable worktree/container quality sandbox and patch-only web orchestration.
- Disposable PostgreSQL integration tests and evidence-first evaluation rubric.

### Changed
- Product claims now describe a five-stage LLM-assisted pipeline rather than autonomous evidence generation.
- Legacy numeric score fields are deprecated compatibility projections; canonical scorecard values may be `null` when evidence is incomplete.
- Architecture topology is no longer generated from model prose.

### Security
- Legacy unowned projects fail closed until explicitly backfilled.
- Shared GitHub personal tokens are rejected.
- Failed/cancelled reruns preserve the prior fully successful dashboard.

### Known limitations
- GitHub REST caps and unsupported source languages can make snapshots and dependency maps incomplete.
- External provider calls remain at-least-once after worker crashes; database publication is lease-fenced and idempotent.
- Organization policy governs who can approve a GitHub App installation.
- Docker sandboxing requires a dedicated trusted worker host and a reviewed image digest.

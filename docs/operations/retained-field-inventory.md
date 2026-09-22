# Retained-field inventory (P1.2)

Immediate revocation happens synchronously when deletion starts: project status becomes
`deletion_pending`, ingestion and inference are suspended, GitHub bindings are
disconnected, and queued or running runs and jobs are cancelled. No new processing is
admitted after revocation.

Active-system deletion purges primary rows and derived artifacts in dependency order
(jobs, runs, stages, evidence, scorecards, artifacts, snapshots, files, projections,
sources, onboarding state, permission snapshots, overrides) and then the project row.
Workspace deletion purges every project, memberships, invitations, destroys the tenant
key, and then deletes the organization.

Backup expiry is handled by the hosting provider schedule; backups are not queried as
live stores and age out without restore into active systems. Restore drills must never
resurrect deleted customer content: restores are scoped to non-deleted tenants and
verified by absence checks.

Legally retained billing metadata, if any, is limited to non-content invoice records
and never includes source code, repository content, prompts, diffs, or model artifacts.

| Retained field | Classification | Purpose / legal basis | Max retention | Encryption / digest | Deletion | Backup | Owner |
|---|---|---|---|---|---|---|---|
| DeletionRequest tombstone (keyed digests, scope, timestamp, actor) | Internal operations metadata | Deletion audit and completion proof | 3 years | Tenant-keyed HMAC; key destroyed on workspace deletion | Retained as completion record | Expires with backup schedule | Platform |
| AuditLog action without content details | Operations metadata | Security audit | 1 year | Redacted details only | Aged out | Expires with backup schedule | Platform |
| AI budget aggregates (no prompts or content) | Operations metadata | Abuse prevention and quota enforcement | 90 days | No customer content | Aged out | Expires with backup schedule | Platform |

Threat-modeled as potentially sensitive customer identifiers: commit SHAs, paths,
repository names, content hashes, manifest digests, model artifacts, and audit
references. Tombstones store only tenant-keyed digests so destroying the tenant key
makes retained values unusable for dictionary confirmation of guessed files,
repositories, or commits.

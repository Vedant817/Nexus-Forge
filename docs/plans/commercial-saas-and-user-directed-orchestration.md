# Plan: Commercial SaaS and User-Directed Orchestration

Status: Proposed
Date: 2026-09-22
Companions: [ADR-0001](../adr/0001-evidence-first-repository-intelligence.md), [current roadmap](../roadmap.md), [review remediation plan](resolve-review-open-points.md)

## Executive decision

Nexus Forge should become a **continuous engineering assurance workspace**:

> Connect important repositories, establish a commit-pinned evidence baseline, detect meaningful change, decide what needs action, and export defensible proof of the result.

The product should not compete as a generic AI coding assistant, repository chatbot, or autonomous software engineer. Its defensible advantage is the separation of deterministic evidence and scorecards from constrained LLM explanation and drafting.

The commercial sequence is:

1. Close the security, privacy, tenancy, deletion, and operational launch blockers.
2. Run customer discovery and secure conditional pilot commitments in parallel, using public/synthetic repositories until the launch blockers close.
3. Ship deterministic-only baselines, minimal weekly monitoring, and the complete paid-pilot trust foundation.
4. Sell a small number of assisted paid pilots around repository baselines and recurring change reviews.
5. Add user-directed orchestration through versioned profiles, preflight, and immutable run manifests.
6. Expand recurring value through richer triggers, comparisons, findings triage, and notifications.
7. Add self-service subscriptions only after repeated usage and retention are demonstrated.
8. Add collaboration, policy governance, safe sandbox verification, and enterprise controls in that order.

Paid general availability is not approved in the current state. A controlled paid pilot can begin after the Phase 0 and Phase 1 gates in this plan are met and the customer contract accurately describes private-code processing and retention.

## PM council

Three senior product perspectives were used to force explicit trade-offs.

### PM 1: Commercial and growth

Position: More generated reports will not create durable willingness to pay. The product needs an urgent buyer, a recurring trigger, and an outcome that can be shared with another stakeholder.

Proposal:

- Target platform engineering, engineering leadership, and security/compliance champions at B2B software companies.
- Sell active monitored repositories rather than model tokens or ordinary viewer seats.
- Make the activation event an accepted baseline plus enabled monitoring, not a completed LLM call.
- Start with assisted pilots and validate repeat usage before automating the entire billing funnel.

### PM 2: Platform and orchestration

Position: Giving users raw prompts, arbitrary DAGs, or shell access creates complexity without trustworthy control. Users should express intent and constraints; the platform should compile and enforce them.

Proposal:

- Add versioned orchestration profiles and curated templates.
- Resolve preferences into an immutable `RunManifest` before work starts.
- Keep capabilities typed, versioned, allowlisted, and policy-controlled.
- Make evidence collection independent from optional LLM stages.
- Use durable approval records for any side effect or sandbox execution.

### PM 3: Trust, security, and enterprise

Position: Charging users while private repositories can be incorrectly bound, deletion is ineffective, and production operations are unproven creates unacceptable customer and company risk.

Proposal:

- Treat the vulnerable framework version, GitHub App authority gap, data lifecycle, provider privacy controls, tenant isolation, entitlements, backups, monitoring, and auditability as launch blockers.
- Default private repositories to deterministic-only processing until external AI processing is explicitly authorized.
- Preserve minimal sanitized ledger metadata while making customer content deletable.
- Fail closed for authorization, privacy policy, entitlements, and approval gates.

### Council resolution

The council accepted all three positions with these decisions:

1. **Primary market:** engineering assurance for teams, not a broad consumer productivity tool.
2. **Initial revenue:** assisted paid pilots before self-service subscriptions.
3. **Control model:** fixed safety boundaries with flexible, declarative user preferences.
4. **Trust model:** deterministic collectors establish facts; LLMs never establish evidence, scores, policy, or approval.
5. **Automation model:** proposal and explanation first; execution only through cataloged capabilities, policy, sandboxing, and explicit approval.
6. **Pricing metric:** active monitored private repositories, with limited editor seats and generous viewer access.
7. **Launch discipline:** no paid GA until every applicable launch gate has objective evidence.

## Current baseline

### Product strengths to retain

- Commit-pinned GitHub repository collection.
- Versioned `PASS` / `FAIL` / `UNKNOWN` / `NOT_APPLICABLE` scorecards.
- Immutable artifacts and a sealed evidence ledger.
- Durable jobs with leases, retries, cancellation, checkpointing, and fenced publication.
- Project-owner authorization and non-enumerating cross-user failures.
- Bounded webhook body handling, HMAC verification, and replay protection.
- Schema-constrained LLM outputs, secret redaction, token budgets, and an inference kill switch.
- A hardened, disconnected Docker quality sandbox that returns a review patch instead of modifying the live checkout.

### Product gaps that prevent customers from receiving recurring value

- There is no end-user GitHub App installation and repository-selection flow.
- Analysis is on demand; there are no schedules, change baselines, trend views, or useful alerts.
- Users cannot choose sources, stages, privacy mode, output profile, evidence policy, budget, or approvals per run.
- Generated outputs are mostly read-only and cannot be approved, corrected, versioned, or regenerated independently.
- Workflow user state can be overwritten by a successful rerun.
- Analysis history exists in storage but is not a usable history, comparison, or rollback experience.
- Webhook-generated drafts are not surfaced in the product.
- There are no organizations, memberships, roles, assignments, comments, or review flows.
- There are no subscriptions, entitlements, customer-visible usage, or upgrade paths.

### Immediate correctness and trust gaps

- `next` 16.2.9 has critical and high advisories in the current dependency audit.
- GitHub App binding verifies installation access but not that the signed-in user is authorized to bind that installation.
- Project/account deletion is incompatible with current restrictive immutable-ledger relationships.
- Private code can be transmitted to Groq without a tenant-facing privacy policy or explicit repository-level control.
- Regex redaction is useful defense-in-depth, not a guarantee that private or secret data cannot leave the platform.
- Billing entitlements do not exist and therefore cannot be enforced at job admission.
- Deployment, worker rollout, backup restoration, health checks, and incident response are not reproducible from the repository.
- Audit events are incomplete and not consistently attributed to an actor.
- Browser security headers, CSP, request-body admission limits, and broad mutation origin protection are incomplete.
- The proof-pack UI points to a different export URL than the implemented route, and several screens suppress actionable request failures.

## Market and product scope

### Primary ideal customer profile

- B2B software or developer-infrastructure company.
- Approximately 30-200 engineers and 10-100 active repositories.
- Uses GitHub Cloud and releases frequently.
- Has recurring release-review, customer-security, engineering-standardization, or audit-evidence work.
- Economic buyer: CTO, VP Engineering, Head of Platform, or Head of Security Engineering.
- Champion: staff engineer, platform/DevEx lead, engineering operations lead, or release manager.

### Secondary user segment

Individual builders can continue using workflow and proof-pack features, but they should not drive the near-term architecture or roadmap. A low-price Builder plan should be tested only if organic use demonstrates retention. It must not distract from the monitored-repository assurance loop.

### Discovery and investment gates

Customer discovery runs in parallel with Phase 0. It must not require private-code ingestion before the trust gates close.

Before funding the full orchestration build:

- Complete at least 15 interviews across economic buyers, champions, repository owners, and security reviewers in the primary ICP.
- Observe at least five real release/evidence-review workflows rather than asking only hypothetical questions.
- Document current alternatives, budget owner, review frequency, time spent, failure cost, and security/procurement objections.
- Obtain at least three conditional pilot commitments at the proposed USD 4,000-6,000 price, contingent on the Phase 1 trust gates.
- Confirm that at least three design partners need a weekly or release-triggered workflow rather than only an annual audit.

Before funding self-service billing and broad acquisition:

- At least 50% of activated pilots review results during weeks 5-8.
- Median reported savings is at least two engineer-hours per active repository per month or an equivalent documented risk/release outcome.
- Assisted support falls below two staff-hours per workspace per week by pilot week four.
- At least 20% of qualified pilots convert or sign an annual intent at the tested package price.
- Gross-margin modeling shows the plan can absorb expected GitHub, model, storage, email, and support cost.

If fewer than three buyers make a conditional paid commitment, stop expanding platform scope and retest the buyer/problem/positioning before implementing P2/P3.

### Jobs to be done

1. Establish whether a repository meets an agreed engineering baseline at a specific commit.
2. Identify material regressions or improvements since the last accepted baseline.
3. Explain why a result changed using source-linked evidence.
4. Assign, waive, or resolve findings and prove remediation at a later commit.
5. Generate a defensible release, customer, audit, or leadership evidence package.
6. Apply consistent policy across a portfolio without converting uncertainty into failure.
7. Let teams choose analysis depth, privacy, cost, schedule, and approval posture without bypassing safety controls.

### Product principles

1. Evidence is authoritative; generated prose is review-required.
2. User preferences constrain execution but cannot weaken platform safety policy.
3. Every run has an immutable, downloadable execution contract.
4. Deterministic work must succeed and remain useful when inference is disabled or unavailable.
5. Missing access remains `UNKNOWN`, never an inferred failure.
6. No external side effect occurs without a cataloged capability and the required approval.
7. Every sensitive data transfer is visible, configurable, and auditable.
8. Pricing should map to customer value and platform cost without exposing token accounting as the product.

## Target product experience

### First-run activation

1. User creates or joins a workspace.
2. User starts a signed GitHub App installation flow.
3. Nexus Forge verifies the callback, installation account, user authority, and selected repository scope.
4. User selects one or more repositories and sees exactly what can be accessed.
5. User chooses a curated template: `Repository baseline`, `Release evidence review`, or `Builder workflow`.
6. User chooses an analysis posture: `Deterministic only`, `Standard`, or `Strict`.
7. Preflight shows the commit/PR SHAs, selected sources, data leaving the platform, enabled capabilities, expected duration, maximum cost/usage, and approvals.
8. The system compiles an immutable run manifest and starts a durable run.
9. The user reviews evidence and accepts the run as a baseline.
10. The user enables a schedule or event trigger and chooses notification rules.

The activation event is **an accepted baseline with recurring monitoring enabled**.

### Recurring assurance loop

```text
repository event or schedule
  -> pin commit and compile manifest
  -> collect deterministic evidence
  -> seal evidence and evaluate scorecards
  -> compare with accepted baseline
  -> summarize material deltas with citations
  -> notify only when policy says the delta matters
  -> acknowledge, assign, waive, or remediate
  -> rerun and verify the result at a new commit
```

### User-control model

Users may control:

- Selected repositories, branches, refs, PRs, and source documents.
- Deterministic-only versus LLM-assisted processing.
- Optional stages and output templates.
- Audience, tone, detail, and workflow granularity for drafts.
- Approved model tier from an operator allowlist.
- Per-run budget and maximum duration within plan limits.
- Schedule, trigger, materiality, and notification settings.
- Evidence thresholds, finding dispositions, and approval requirements within organization policy.
- Approved quality check profile and selected file scope.
- Retention period and external provider policy when the plan permits it.

Users may not control:

- Evidence integrity, score arithmetic, audit logging, or tenant authorization.
- Arbitrary prompts, shell commands, network destinations, or executable DAG nodes.
- Mandatory safety stages, credential isolation, or provider allowlists.
- Whether an LLM can create evidence, mark a check passed, waive policy, or approve its own work.
- Mid-run mutation of an immutable manifest.

## Orchestration control plane

### Desired architecture

```text
organization policy + project profile + run overrides
                         |
                         v
              deterministic preflight compiler
                         |
                         v
          immutable content-addressed RunManifest
                         |
                         v
             durable capability scheduler
                /                     \
               v                       v
 deterministic collection       optional LLM transforms
               |                       |
               v                       v
 sealed evidence + scorecards   cited review-required drafts
                \                     /
                 v                   v
                 approvals and artifacts
                         |
              optional dedicated sandbox
                         |
                   review patch only
```

### Configuration precedence

Configuration resolves in this order, where a lower level may narrow but never relax a higher-level safety rule:

1. Hard platform safety policy.
2. Deployment and region policy.
3. Organization policy.
4. Workspace or team profile.
5. Project profile.
6. User preference.
7. Validated run-specific override.

Every resolved field records its source. A conflict fails preflight with a machine-readable explanation instead of silently choosing a value.

### Orchestration profiles

Add versioned profiles with these domains:

- **Scope:** repositories, refs, PR, selected source IDs, inclusion/exclusion paths.
- **Analysis:** deterministic-only/full, enabled optional stages, output template, quality posture.
- **Evidence:** scorecard version, required collectors, minimum completeness, materiality policy.
- **Generation:** audience, tone, detail, task granularity, citation requirement, model tier.
- **Budget:** maximum tokens, estimated cost ceiling, timeout, concurrency, rerun policy.
- **Privacy:** external inference allowed, provider allowlist, content classifications, retention.
- **Automation:** manual, scheduled, push, pull request, release, or webhook trigger.
- **Approval:** who approves external inference, sandbox execution, exceptions, exports, and PR creation.
- **Notification:** immediate/digest, event types, destinations, escalation.

Published profile revisions are immutable. Editing creates a new revision. Active runs retain the revision they started with.

### Curated templates

Launch with a small set rather than a visual workflow builder:

1. **Repository baseline:** deterministic repository evidence, scorecard, dependency map, optional explanation.
2. **Release evidence review:** repository baseline plus immutable PR snapshot, checks, reviews, scoped risk explanation, and release report.
3. **Remediation verification:** compare a new commit with a finding or accepted baseline and prove change.
4. **Builder workflow:** selected learning sources plus repository evidence, implementation workflow, and proof drafts.
5. **Strict assurance:** all supported collectors, high completeness requirement, explicit approvals, no unsupported auto-waivers.

Templates have draft, validated, published, deprecated, and retired states. Published versions cannot be edited in place.

### Preflight compiler

Preflight must:

- Resolve profile inheritance and validated run overrides.
- Pin project, source snapshot, repository commit, PR head, template, scorecard, collector, prompt, schema, model, and capability versions.
- Verify GitHub and integration access without exposing credentials.
- Confirm entitlement, quota, concurrency, storage, and budget availability.
- Classify data sent to each external provider.
- Estimate duration and maximum billable usage.
- Identify side effects, non-idempotent operations, and required approvals.
- Reject unsupported thresholds or unavailable evidence collectors.
- Produce blocking errors, warnings requiring acknowledgement, and a deterministic manifest digest.

No job is admitted before preflight succeeds.

### Immutable run manifest

`RunManifest` is the content-addressed execution contract and includes:

- Tenant, project, requester, template, and profile revision identity.
- User objective, selected inputs, tenant-keyed source digests, commit SHA, and PR head SHA; all customer-identifying fields remain subject to the retention/deletion policy.
- Ordered built-in capabilities and their exact versions.
- Model/provider configuration and whether inference is permitted.
- Data handling, retention, and provider-transmission decisions.
- Per-capability timeout, retry, idempotency, resource, and cost limits.
- Scorecard version, completeness requirements, and approval gates.
- Entitlement/plan snapshot used at admission.
- Policy-engine version, preflight result, acknowledgements, and manifest hash.

Manifest changes create a new run or revision and invalidate affected approvals. Historical reruns default to the original versions; upgrades must be explicit.

The initial integrity contract uses canonical serialization, a versioned hash algorithm, and an append-only manifest reference from the run. It does not claim a cryptographic signature. If external attestation is later required, add a separate signature envelope with signer identity, key custody/rotation, verification, revocation, and historical-validation rules.

### Capability catalog

Each built-in capability declares:

- Stable ID, semantic version, owner, and lifecycle status.
- Input/output schema and dependency requirements.
- Trust class: `DETERMINISTIC_READ_ONLY`, `LLM_TRANSFORM`, `SANDBOXED_EXECUTION`, or `EXTERNAL_SIDE_EFFECT`.
- Required scopes, credentials, network destinations, and data classifications.
- Side effects, idempotency semantics, retry policy, timeout, and resource class.
- Evidence emitted and artifact produced.
- Whether approval is mandatory.

The initial catalog is code-reviewed and closed. An open plugin marketplace and arbitrary user code are out of scope.

### Correct execution order

Refactor the current pipeline into these boundaries:

1. Snapshot run inputs.
2. Collect repository, source, PR, CI, and supported deterministic evidence.
3. Persist and seal the evidence snapshot.
4. Evaluate canonical deterministic scorecards.
5. Optionally run LLM explanation/drafting stages against sealed evidence.
6. Publish each successful artifact independently with partial-success semantics.
7. Optionally propose a patch.
8. Require approval bound to the patch hash.
9. Execute approved checks on a dedicated sandbox worker.
10. Persist deterministic verification evidence and recompute affected scorecards.

This resolves the current coupling where later LLM failure prevents otherwise valid evidence and scorecards from being published.

### Approval model

Approvals are durable records containing:

- Actor, role, tenant, action, scope, and reason.
- Manifest, patch, artifact, or exception hash.
- Warnings shown to the approver.
- Approval/rejection outcome, timestamp, expiration, and invalidation reason.
- Separation-of-duty requirement where applicable.

Approval gates initially cover:

- Enabling external inference for a private repository.
- Accepting a baseline.
- Granting or changing a policy exception.
- Running an untrusted repository command in the sandbox.
- Exporting a sensitive evidence bundle.
- Creating a GitHub pull request in a later phase.

### Safe sandbox execution

The existing Docker sandbox becomes a separate durable worker service, never part of the web process. It must add:

- Dedicated hosts and queue-wide concurrency/admission control.
- Approved image digest allowlist, seccomp/AppArmor policy, disk quota, and bounded command count.
- Fixed server-side check profiles rather than user-provided argv.
- No network by default, no Docker socket, no application secrets, and no long-lived GitHub token.
- Input commit hash and approved patch hash verification.
- Redaction of command output and patch content before persistence/return.
- Signed result metadata and deterministic `PASS`/`FAIL`/`UNKNOWN` evidence.
- Cleanup proof and dead-letter handling.

It returns a review patch. Automatic merge is not allowed. Later PR creation requires a second explicit approval and a short-lived repository-scoped token.

“Signed result metadata” is an internal worker attestation, not a claim of third-party non-repudiation. Canonically serialize a result envelope containing tenant/run/sandbox IDs, manifest and approved patch hashes, input commit, image digest, check-profile ID/version, command outcomes, timestamps, worker identity, log/artifact hashes, and a unique nonce. Sign the envelope with a managed Ed25519 worker-attestation key; store key ID and validity period, support overlapping rotation, and verify the signature plus run/manifest/nonce binding before creating verification evidence. Raw logs, source, and secrets are never included in the signed envelope.

## Feature plan

### P0: Emergency security and correctness

These items block additional external onboarding.

#### P0.1 Dependency remediation

- Upgrade Next.js and `eslint-config-next` to a supported non-vulnerable release after reviewing the version-specific local documentation.
- Triage all remaining critical/high production-reachable audit findings.
- Add dependency scanning, SBOM generation, and a documented exception process to CI.
- Add a 24-hour actively exploited critical, 72-hour critical, and 14-day high patch target.

Acceptance:

- No unresolved known exploitable critical runtime vulnerability.
- Authentication, proxy, API, caching, and build regression tests pass.
- Release artifacts identify the source commit and include an SBOM.

#### P0.2 GitHub App authority-safe onboarding

- Replace request-supplied installation binding with a signed, expiring, single-use callback state tied to session and tenant.
- Verify the authenticated GitHub identity can administer or is explicitly authorized to connect the installation/repository.
- Persist installation account ID/type, selected repository IDs, permission snapshot, and last reconciliation time.
- Handle suspension, deletion, repository removal, and permission changes through verified events and periodic reconciliation.
- Build an installation, organization, and repository-selection UI with recovery guidance.

Acceptance:

- A user cannot bind another tenant's installation even with valid numeric IDs.
- Expired/replayed state fails.
- Lost repository permission prevents later collection.
- Negative cross-tenant and insufficient-role tests pass.

#### P0.3 Correctness and failure UX

- Fix the proof-pack export URL mismatch.
- Check `response.ok` on all product fetches and mutations.
- Preserve terminal failure details in run history and show actionable recovery options.
- Validate and bound workflow mutation JSON.
- Prevent reruns from overwriting human-maintained task state; store generated workflow revisions separately from user overlays.
- Add optimistic concurrency/revision IDs to user edits.

Acceptance:

- No failed request silently redirects as success.
- User task status and criteria survive a successful rerun.
- Malformed/oversized workflow updates return bounded validation errors.

#### P0.4 Data-transfer containment

- Default private repositories to deterministic-only processing until an authorized user enables external inference.
- Add a real deterministic-only execution path: collect and persist evidence, seal the ledger, evaluate scorecards, and publish dependency maps without creating or invoking LLM stage jobs.
- Publish deterministic evidence before optional generation so later model failure cannot erase a valid baseline.
- Add high-risk path exclusions, entropy/structured secret detection, provider-specific patterns, and output scanning.
- Quarantine/block suspected secrets by default and allow only an auditable administrator override.
- Ensure prompts, code, diffs, provider bodies, and secrets cannot enter logs, traces, analytics, or error reporting.
- Retain the global ingestion and inference kill switches and add tenant/repository-specific suspension.

Acceptance:

- Private content cannot reach a model without effective policy authorization recorded in the manifest.
- With inference globally disabled, a supported repository completes a deterministic baseline and no provider call is attempted.
- Failure of an optional model stage leaves the sealed deterministic baseline available.
- A maintained secret corpus and bypass test suite pass.
- The UI states residual risk honestly; it never promises complete secret removal.

#### P0.5 Minimal preflight and admission manifest

Before any external customer run, add a fixed-template preflight and immutable content-addressed admission manifest. This is intentionally smaller than the rich profile system in P2.

The minimum manifest pins:

- Tenant, actor, project, repository connection, commit/PR identity, selected sources, and tenant-keyed input digests.
- Fixed pipeline/template, collector, scorecard, prompt/schema, model/provider, and code versions.
- Deterministic-only or inference-enabled privacy decision and acknowledgement.
- Effective contract entitlement, quotas, reservation, and maximum cost/resource limits.
- Retention class, required approvals, request/correlation ID, canonical serialization version, and manifest digest.

Preflight verifies authorization, repository access, privacy policy, entitlement, limits, required acknowledgements, and version availability before the job and reservation are created transactionally. No external customer job is admitted through UI, schedule, webhook, API, or retry without this contract.

Acceptance:

- Every external run references exactly one immutable admission manifest.
- Tampering with canonical manifest content changes the digest and prevents execution/publication.
- Admission and usage reservation are atomic; failed admission creates neither a runnable job nor billable usage.
- Rich P2 profiles can compile into this same contract without changing historical P0/P1 manifests.

### P1: Paid-pilot trust foundation

#### P1.1 Workspace tenancy and authorization

Add:

- `Organization`, `Membership`, `Invitation`, and non-null tenant ownership for every customer object.
- Initial roles: `OWNER`, `ADMIN`, `OPERATOR`, `REVIEWER`, `VIEWER`.
- Central authorization policies at the data-access boundary.
- Tenant-scoped caches, queues, schedules, object storage, exports, billing, and audit events.
- Time-bound, approved, attributed support access.
- PostgreSQL RLS or an equivalent defense-in-depth plan after the application boundary is stable.

Use deny-by-default permissions. Initial role contract:

| Action | Owner | Admin | Operator | Reviewer | Viewer |
|---|---:|---:|---:|---:|---:|
| View projects, runs, and allowed evidence | Yes | Yes | Yes | Yes | Yes |
| Connect/select repositories | Yes | Yes | No | No | No |
| Create/cancel permitted runs | Yes | Yes | Yes | No | No |
| Publish profiles/templates | Yes | Yes | No | No | No |
| Accept baselines and disposition findings | Yes | Yes | Yes | Yes | No |
| Approve private-code inference | Yes | Yes | No | No | No |
| Approve sandbox execution | Yes | Yes | No | Reviewer if policy permits | No |
| Create/approve policy exceptions | Yes | Yes, subject to separation policy | No | Reviewer if policy permits | No |
| Export sensitive evidence | Yes | Yes | If policy permits | If policy permits | No |
| Manage members, retention, billing, and deletion | Yes | Admin except owner transfer/workspace deletion | No | No | No |
| Transfer ownership or delete workspace | Yes with step-up | No | No | No | No |

Organization policy may narrow these permissions but cannot grant a role actions denied by hard platform policy. Self-approval is forbidden where a policy requires separation of duties.

Acceptance:

- Cross-tenant negative tests cover every API, background job, export, integration, and billing object.
- Same-tenant negative tests cover every currently implemented role/action pair, approval path, schedule, webhook, and worker transition. Repeat the same matrix when service accounts and new actions ship.
- Request parameters alone never determine tenant access.
- Support access is visible to the customer and audit log.

#### P1.1a Authentication assurance and step-up

- Require phishing-resistant MFA where feasible for owners/admins in paid pilots; support passkeys or authenticator-based MFA rather than relying on SMS.
- Require recent step-up authentication for repository connection, private-code inference approval, role/billing/retention changes, sensitive export, account deletion, ownership transfer, support access, and sandbox/PR approval.
- Add session inventory, individual/global revocation, session-age policy, suspicious-login notification, and secure recovery codes.
- Record authentication assurance level and recent-auth timestamp with privileged audit events.

Acceptance:

- A stolen ordinary session cannot perform a step-up-protected action.
- Privileged pilot roles cannot remain enrolled without the required MFA posture.
- Recovery, session revocation, and lost-device flows are tested without creating an account-takeover bypass.

#### P1.2 Deletion, retention, and archival

Separate customer content from sanitized integrity metadata:

- Store source/code content, manifests containing source/repository identity, and sensitive derived artifacts in deletable, tenant-encrypted storage.
- Use tenant-keyed digests for customer content where correlation is needed. Destroying the tenant key must make retained digest values unusable for dictionary confirmation; do not assume an ordinary hash of predictable private code is non-sensitive.
- Store only a threat-modeled minimum of non-sensitive tombstone/event metadata and legally required records after deletion.
- Add workspace, project, repository, source, run-content, and account deletion requests.
- Revoke access and stop new processing immediately when deletion starts.
- Purge primary data, derived artifacts, queues, caches, search, exports, provider files if any, and backup copies under a documented schedule.
- Use tenant-scoped envelope encryption so key destruction can support cryptographic erasure.
- Track deletion progress and issue a completion record.
- Maintain a retained-field inventory with classification, purpose/legal basis, maximum retention, encryption/digest treatment, deletion behavior, backup behavior, and responsible owner.
- Threat-model commit SHAs, paths, repository names, content hashes, manifest digests, model artifacts, and audit references as potentially sensitive customer identifiers.

Acceptance:

- Seeded deletion tests prove removal from every active store.
- Restore drills do not resurrect deleted customer content.
- A deleted tenant's retained values cannot be used to confirm a guessed source file, repository identity, or commit through an unkeyed hash comparison.
- Product UI and terms accurately distinguish immediate revocation, active-system deletion, backup expiry, and legally retained billing metadata.

#### P1.3 Privacy and customer trust center

Ship:

- Just-in-time disclosure of what repository/source data goes to which provider and why.
- Workspace and repository external-inference settings.
- Deterministic-only mode with useful scorecards and dependency maps.
- Path/file exclusions and an estimate of selected content before run approval.
- Privacy policy, terms, DPA, subprocessor list, retention policy, security overview, and vulnerability disclosure contact.
- Repository connections page, one-click disconnect, active sessions, and recent security activity.
- Provider/model identity and privacy decision in every run manifest.

Acceptance:

- A customer can understand and control external data transfer before the first transfer.
- Disconnect immediately stops new collection.
- Product behavior matches published policy and provider contracts.

#### P1.4 Reproducible production operations

Add version-controlled deployment definitions for the pilot surfaces:

- Web service, analysis workers, migration jobs, schedules, and secrets references. Add the sandbox worker definition when P5 introduces that service.
- Health/readiness endpoints and graceful deployment/rollback.
- Database pool/statement timeout policy and worker capacity controls.
- Automated encrypted backups, explicit RPO/RTO, and recurring restore drills.
- Structured request/job logs, metrics, traces, dashboards, and alerts without sensitive payloads.
- Runbooks for GitHub compromise, provider incident, cross-tenant access, runaway spend, stuck jobs, webhook outage, failed deletion, and restore.

Acceptance:

- A clean environment can be provisioned reproducibly.
- A restore drill proves the stated RPO/RTO.
- Alerts cover queue age/depth, failures, retries, dead letters, webhooks, GitHub limits, model errors, budget anomalies, billing drift, and deletion failures.

#### P1.5 Attributed audit ledger

Record actor, tenant, target, request/correlation ID, interface, outcome, safe change metadata, and support/impersonation context for:

- Authentication and session changes.
- Membership and role changes.
- GitHub installation/repository scope changes.
- Profile, privacy, retention, and integration changes.
- Run creation, cancellation, rerun, export, and deletion.
- Approval and exception decisions.
- Billing and entitlement transitions.
- Support access and security administration.

Acceptance:

- Audit data contains no code, prompts, full model outputs, credentials, or secrets.
- Events are append-only/tamper-evident, access-controlled, exportable, and covered by retention policy.

#### P1.6 Browser/API hardening and abuse controls

- Enforce CSP, HSTS, frame ancestors, MIME-sniffing, referrer, and permissions policies.
- Apply an application-wide origin/CSRF policy for cookie-authenticated mutations.
- Enforce body caps before JSON parsing.
- Add database-safe limits for projects, sources, storage, runs, exports, schedules, and concurrency.
- Rate-limit by user, tenant, IP where appropriate, installation, repository, operation, and cost dimension.
- Add idempotency keys and duplicate-job suppression.
- Add anomalous signup/usage/export detection and administrative suspension.

Acceptance:

- Stored/rendered repository content and model output pass XSS tests.
- Concurrent requests cannot bypass source, run, storage, or spend limits.
- Abuse cannot create unbounded GitHub/model/sandbox cost.

#### P1.7 Contract entitlement foundation

Paid pilots need enforceable limits even before self-service Stripe billing exists:

- Add a provider-independent entitlement service and immutable entitlement revision.
- Configure pilot repository, user, run, storage, schedule, model, export, and concurrency allowances administratively.
- Snapshot effective entitlements into every admitted run.
- Reserve usage transactionally with job creation and reconcile it after completion/failure.
- Define pilot grace, expiration, suspension, and read-only post-contract behavior.
- Expose current limits and usage to pilot customers; do not rely on an internal spreadsheet.

Acceptance:

- An expired or exhausted pilot cannot start new paid work through UI, API, schedule, webhook, or worker retry.
- Existing customer data remains available under the documented post-contract policy.
- Stripe can later become one source of entitlement revisions without replacing product authorization logic.

#### P1.8 Activation and product quality

- Add a guided setup checklist, permission explanations, repository compatibility preflight, and estimated first-run duration.
- Provide a public sample repository/demo for users who cannot install the GitHub App immediately.
- Add consistent empty, loading, retry, partial-success, offline, and provider-degraded states.
- Make critical screens responsive and keyboard-accessible; target WCAG 2.2 AA for the paid product path.
- Add in-product documentation, support contact, incident/status links, and privacy-safe feedback capture.
- Align landing-page ingestion claims with implemented behavior; either implement a connector securely or state that URL content must be pasted.

Acceptance:

- A qualified customer can connect a supported repository and reach a useful baseline without operator database access.
- Accessibility checks cover every implemented paid-pilot path: authentication, onboarding, preflight, run detail, usage, settings, and deletion. Add findings and billing flows to the gate when those features ship.
- Product copy does not imply unsupported source collection or autonomous execution.

#### P1.9 Claim calibration and score semantics

ADR-0001 forbids treating the current weighted rollups as calibrated quality or release predictions. Before commercialization:

- Remove or qualify `go` / `no-go`, “ready,” “clean,” and pass-threshold claims that exceed observed criteria.
- Present the canonical numeric rollup as a versioned evidence summary alongside completeness and status counts, not as a probability of quality, security, or release success.
- Define `accepted baseline` as a human workflow state, not proof that the repository is defect-free.
- Define `accepted clean result` narrowly: no unresolved policy-blocking `FAIL` and no required `UNKNOWN` for that published policy version. Always display that this is scoped policy satisfaction, not comprehensive assurance.
- Keep organization policy thresholds in a separately labeled policy result; they do not modify the canonical scorecard.
- Build a versioned evaluation set representative of supported stacks, repository sizes, and release states, with fixed commit/PR fixtures and expert labels.
- Use at least two independent reviewers for outcome labels, publish disagreements/inter-rater agreement, and measure criterion precision/recall, completeness, false-positive/negative behavior, and version regressions.
- Publish any future readiness claim, threshold, or badge only after its intended use, sample, acceptance target, limitations, and confidence interval are documented and met.

Acceptance:

- No paid-product surface or sales material implies an uncalibrated score predicts release success, security, compliance, or overall engineering quality.
- The current release template reports observed checks, unknowns, risks, and policy status without an unsupported global `go` decision.
- Every shipped scorecard version passes a fixed evaluation regression suite and links to its methodology/limitations.

#### P1.10 Minimal paid-pilot loop

Paid pilots require recurring value before the richer P3 automation system:

- Let an authorized user accept one run as a repository baseline.
- Add one durable weekly schedule per pilot repository, with plan-level concurrency and spend limits.
- Compare canonical evidence and criterion statuses against the accepted baseline.
- Send one bounded email digest containing material additions, removals, status changes, unknowns, and links to exact evidence.
- Let users pause the schedule, acknowledge a result, and select a newer accepted baseline.
- Operate this loop with explicit support and delivery SLOs; do not simulate recurring value through manual internal reruns hidden from the customer.

Acceptance:

- Scheduler restart, duplicate firing, and missed-run recovery tests do not duplicate billable runs or silently skip the next review.
- Five fixed fixture repositories produce expected baseline diffs and no-change digests.
- The pilot customer can see schedule state, last/next run, usage impact, and delivery outcome.

#### P1.11 Commercial, tax, and support readiness

Before the first paid pilot invoice:

- Confirm the contracting entity, order form, terms, DPA, privacy/subprocessor disclosures, support scope, refund/termination policy, and liability position with qualified counsel.
- Determine sales-tax/VAT/GST nexus and customer-location evidence requirements for every selling jurisdiction.
- Obtain required registrations before collecting tax. Do not assume manual invoices or later Stripe Tax adoption remove current obligations.
- Define invoice tax treatment, exemptions, reverse-charge handling, filing/remittance owner, accounting reconciliation, and record retention.
- Configure pilot invoicing/accounting with unique invoice identity, payment status, credit/refund handling, and entitlement linkage.
- Establish a support intake, severity model, response target, named owner, escalation, and customer incident communication path.

Acceptance:

- Finance/legal approve a dated launch checklist for the first customer's jurisdiction before contract signature/invoice.
- A pilot invoice, payment, refund/credit, delinquency, cancellation, and entitlement-expiry rehearsal reconciles end to end.
- Required registrations are active before tax is enabled or collected for a jurisdiction.

### P2: Evidence and orchestration foundation

#### P2.1 Evidence lifecycle correction

- Complete the evidence lifecycle beyond the minimum deterministic-only path introduced in P0.
- Add immutable `PullRequestSnapshot`, changed-file, check, and review records pinned to PR head SHA.
- Add source-content hash, byte count, content type, and snapshot identity to source evidence.
- Carry actual collector observation time, collector ID, and exact collector version per record.
- Add bounded citation objects (`claim`, `evidenceIds`, `limitations`) to all generated findings.
- Add explicit bounds to LLM schema arrays and strings.
- Update stale evidence documentation to match commit-pinned collection.

Acceptance:

- Deterministic-only runs produce useful sealed evidence and scorecards.
- Failure of workflow/proof generation does not discard repository/release evidence.
- Unsupported generated claims are rejected or visibly marked unsupported.

#### P2.2 Profiles, templates, preflight, and manifests

Expand the minimum P0/P1 admission contract into the full control-plane model described above with:

- Project defaults and immutable profile revisions.
- Three safe presets: `Fast`, `Standard`, `Strict`, plus advanced bounded controls.
- Curated templates and version lifecycle.
- Deterministic preflight and manifest compilation.
- Plan/quota reservation at admission.
- Downloadable manifest and human-readable preflight summary.

Acceptance:

- Every new run references exactly one immutable manifest hash.
- Profile changes never mutate active or historical runs.
- Conflicts and unavailable capabilities fail before enqueueing.
- The run screen shows which setting came from which policy layer.

#### P2.3 Durable typed scheduler

- Convert the monolithic pipeline into built-in capability nodes with explicit dependencies.
- Retain historical dispatchers while runs using them can retry.
- Support node-level cancellation, retry, resume, and partial success.
- Keep deterministic scheduling; models cannot choose capabilities or stage order.
- Add orphaned AI reservation reconciliation and scheduled rate-limit cleanup.

Acceptance:

- A failed optional drafting node does not invalidate completed evidence nodes.
- Rerunning one eligible node reuses immutable inputs and does not repeat unrelated external work.
- Unknown non-idempotent outcomes require reconciliation rather than automatic retry.

#### P2.4 Run history and comparison

Ship:

- Searchable run list and stage timeline.
- Manifest, evidence, scorecard, artifact, cost, duration, approval, and failure detail.
- Run-to-run, run-to-baseline, and rerun-to-original comparison.
- Deterministic explanations for input, version, policy, evidence, score, cost, and approval differences.
- Explicit baseline acceptance, supersession, and restoration of the active view without deleting history.

Acceptance:

- A user can answer exactly why a score or result changed without reading raw logs.
- Historical runs remain reproducible from pinned inputs and versions where dependencies remain available.

#### P2.5 Generated artifact review and revision

Treat explanations, workflows, release narratives, and proof copy as versioned drafts with a human-owned overlay:

- Add artifact states: `DRAFT`, `CHANGES_REQUESTED`, `APPROVED`, `SUPERSEDED`, and `REJECTED`.
- Store model output as an immutable source revision and human edits as separately attributed revisions.
- Preserve evidence citations, correction reason, author, timestamp, and parent revision.
- Let an authorized user regenerate one artifact/stage with the same manifest inputs or a new manifest revision.
- Show a diff before replacing the active presentation; never overwrite an approved human revision silently.
- Mark citations stale when a human edit changes a factual claim or the baseline changes, and require re-review.
- Separate “approved for internal use” from “approved for external export/publishing.”

Acceptance:

- Human corrections survive analysis reruns and remain attributable.
- Regenerating one artifact does not rerun unrelated collectors or mutate sealed evidence.
- Exported drafts show approval state, revision, evidence scope, and unresolved citation warnings.

### P3: Recurring value and monetization

#### P3.1 Monitoring and trigger engine

- Scheduled weekly/daily runs within plan limits.
- Push, pull-request, merge, release, and manual triggers.
- Event coalescing/debounce and duplicate suppression.
- Commit-to-commit evidence and scorecard deltas.
- Materiality thresholds, quiet periods, suppression, and digest settings.
- Recovery for missed GitHub deliveries and periodic permission reconciliation.

Acceptance:

- A missed/replayed webhook does not silently lose or duplicate an assurance run.
- Alerts are based on material deltas and effective policy, not every scan.
- Users can pause automation without deleting configuration/history.

#### P3.2 Findings triage and remediation

Add durable finding state separate from immutable criterion results:

- `OPEN`, `ACKNOWLEDGED`, `ASSIGNED`, `EXCEPTION_REQUESTED`, `WAIVED`, `RESOLVED`, `REGRESSED`.
- Owner, due date, comments, evidence links, and external issue link.
- Waiver reason, approver, scope, expiration, and automatic re-open conditions.
- Verify-resolution action pinned to a later commit.
- Baseline and policy changes never rewrite historical finding state.

Acceptance:

- A waiver cannot change canonical scorecard evidence or history.
- Expired waivers and regressed criteria reopen predictably.
- Remediation is marked resolved only by deterministic evidence at a newer commit.

#### P3.3 Notifications and shareable outputs

- In-app notification center and email digests first.
- Slack/Teams after email behavior validates which events matter.
- Shareable authenticated reports with expiration and revocation.
- Export repository/release evidence bundles as Markdown and JSON; add PDF only when customer demand is proven.
- Add source-linked evidence drill-down, commit links, and file/line views.
- Surface webhook-created proof drafts for review rather than leaving them API-only.

Acceptance:

- Every notification links to the exact run, manifest, delta, and evidence.
- Sensitive exports require authorization, are audited, and can be revoked where applicable.

#### P3.4 Billing, subscriptions, and entitlements

Use Stripe Billing with hosted Checkout and Customer Portal for self-service subscriptions. This product is not a marketplace, so Stripe Connect is not needed.

Implement:

- Separate Stripe Product per plan and Prices for monthly/annual variants.
- Restricted API key where supported, stored in a managed secrets system with environment isolation and access policy.
- Signed, bounded, idempotent Stripe webhook processing as the billing source of truth.
- Subscription, invoice, payment-failure, trial, upgrade, downgrade, cancellation, refund, dispute, and grace-period handling.
- Internal `BillingCustomer`, `Subscription`, `EntitlementSnapshot`, `UsageLedger`, and `BillingWebhookEvent` records.
- Server-side entitlement checks during preflight, transactional job admission, worker execution, schedule firing, export, and integration actions.
- Customer-visible plan, current usage, limits, billing state, and upgrade path.
- Reconciliation between Stripe state, internal subscriptions, entitlements, and usage.

Do not make every request synchronously dependent on Stripe. Use signed webhook-derived local entitlement state, a short explicit grace policy, and reconciliation.

For a later usage-based plan, use Stripe Metronome rather than starting a new low-level meter implementation. Initial plans should use included repository/run allowances to keep invoices predictable.

Stripe Tax must be evaluated before launch in each selling jurisdiction. Enabling automatic tax is not sufficient without the required active tax registrations.

Acceptance:

- UI hiding is never the only entitlement control.
- Duplicate/out-of-order webhooks are safe.
- A downgrade cannot start work above the new limit after the effective transition.
- Existing data remains readable under the documented cancellation policy while new paid work is blocked.
- Billing and usage races cannot produce unbounded unpaid work.

### P4: Team workflow and integrations

#### P4.1 Collaboration

- Invitations and member lifecycle.
- Project/repository roles layered on workspace roles only if customer demand proves necessary.
- Finding assignment, comments, mentions, review requests, and activity feed.
- Unlimited or generous viewers to encourage stakeholder distribution.
- Optimistic concurrency and clear conflict handling.

#### P4.2 Organization policy packs

- Published organization scorecard/report profiles layered over immutable canonical scorecards.
- Repository groups and inherited policy.
- Required completeness, approval, privacy, retention, and schedule rules.
- Policy simulation against historical manifests before publishing a change.
- Portfolio view of regressions, unresolved findings, exceptions, stale baselines, and evidence completeness.

Custom policy output must be clearly labeled and cannot rewrite canonical historical results.

#### P4.3 Integrations and developer platform

Prioritize integrations based on observed manual work:

1. GitHub Checks and status summaries.
2. Jira or Linear issue creation/linking.
3. Slack or Teams notifications and signed approval actions.
4. Outbound signed webhooks.
5. Versioned public API and scoped service accounts.
6. CLI for `preflight`, `run`, `status`, `cancel`, `compare`, and `evidence export`.

API requirements:

- Stable versioning, pagination, idempotency keys, correlation IDs, machine-readable errors, and rate limits.
- Fine-grained service-account scopes and rotation.
- UI/API parity for essential workflows.
- Signed, replay-protected outbound webhooks.

### P5: Approval-gated verification

This phase turns the current proposal prototype into a real but bounded quality workflow.

- Let users select files and a fixed quality check profile.
- Supply the generator only the approved bounded repository context.
- Persist the proposed patch as an immutable artifact.
- Require approval tied to exact patch and manifest hashes.
- Run fixed checks in the dedicated sandbox worker.
- Convert sandbox results into `verification.result` evidence.
- Re-evaluate proof completeness and show the patch for human review.
- Optionally create a PR after a separate approval; never auto-merge.

Acceptance:

- No web process or LLM can directly invoke Docker, shell, GitHub write actions, or arbitrary network access.
- Check status comes only from sandbox exit/result evidence.
- Cancellation, cleanup, timeout, output redaction, and dead-letter behavior are tested.
- Tampered, replayed, wrong-run, expired-key, and unknown-key result envelopes are rejected and cannot create evidence.
- Rotation tests prove historical attestations remain verifiable for their retention period without permitting retired keys to sign new results.

### P6: Enterprise readiness

Build only after team retention and larger contracts justify it:

- SAML/OIDC SSO, SCIM, domain verification, enforced MFA, and custom roles.
- Separation-of-duty policies and group mappings.
- Configurable retention, data residency, provider routing/disablement, and customer-managed keys where justified.
- Audit/SIEM export, IP allowlisting, private connectivity, and administrative APIs.
- Formal support SLAs, incident commitments, status page, and enterprise procurement package.
- Annual independent penetration testing and a vulnerability disclosure/bug bounty program.
- SOC 2 Type II only after controls have sufficient operating history.
- Additional source-control systems and deterministic language extractors based on contracted demand.

## Proposed data model additions

Names are directional and should be refined during technical design.

| Area | Entities |
|---|---|
| Tenancy | `Organization`, `Membership`, `Invitation`, `SupportAccessGrant` |
| GitHub | `GitHubInstallation`, `RepositoryConnection`, `RepositoryPermissionSnapshot`, `InstallationCallbackState` |
| Orchestration | `OrchestrationProfile`, `ProfileRevision`, `Template`, `TemplateRevision`, `RunManifest`, `CapabilityExecution` |
| Evidence | `PullRequestSnapshot`, `PullRequestFile`, `CheckSnapshot`, `ReviewSnapshot`, `Baseline` |
| Workflow | `GeneratedArtifactRevision`, `ArtifactReview`, `FindingDisposition`, `FindingAssignment`, `FindingComment`, `PolicyException`, `Approval` |
| Automation | `Schedule`, `Trigger`, `NotificationPreference`, `NotificationDelivery` |
| Integrations | `IntegrationConnection`, `ServiceAccount`, `OutboundWebhook`, `WebhookDeliveryAttempt` |
| Billing | `BillingCustomer`, `Subscription`, `EntitlementSnapshot`, `UsageLedger`, `BillingWebhookEvent` |
| Privacy | `RetentionPolicy`, `DeletionRequest`, `DataExport`, `EncryptionKeyReference` |
| Operations | `AuditEvent`, `SecurityEvent`, `IncidentSuspension`, `SandboxRun` |

Every entity must have explicit tenant ownership, lifecycle rules, indexes for scoped access, and deletion/retention behavior. No sensitive credential is stored directly where a logical secret reference or short-lived token can be used.

## Packaging and pricing hypothesis

Pricing is a hypothesis to validate through interviews and paid pilots, not a final commitment.

### Assisted pilot

- 90 days, up to 10 repositories.
- Proposed price: USD 4,000-6,000, with part credited toward an annual contract.
- Includes onboarding, baseline setup, weekly reviews, roadmap interviews, and measured time saved.
- Initial scope is the deterministic repository-baseline and weekly-delta loop. PR/release analysis, external learning sources, and sandbox verification remain disabled until their later provenance and execution gates pass.
- Manual invoicing is acceptable during this stage; product entitlements and usage controls are still required before running paid workload.

### Self-service/contract plans

| Plan | Price hypothesis | Included value |
|---|---:|---|
| Community | Free | 1 public repository, limited on-demand deterministic scans, short history, no schedules |
| Team | USD 500/month annual commitment | 10 active private repositories, weekly monitoring, 10 editors, unlimited viewers, standard scorecards, email digest |
| Business | USD 1,500/month annual commitment | 40 active private repositories, daily/event monitoring, policy packs, RBAC, Jira/Slack, priority support |
| Enterprise | From USD 30,000/year | Negotiated repository allowance, SSO/SCIM, audit export, retention/provider controls, contractual support |

Definitions:

- A plan purchases a fixed number of concurrent monitored-repository slots; initial invoices are not calculated from incidental scan events.
- Activating a private repository requires an explicit authorized action and consumes one available slot. A manual scan cannot silently create a billable overage.
- Repository identity uses the immutable GitHub repository ID. Rename does not create a new repository; transfer, deletion, archive, disconnect, and reconnect have explicit lifecycle events.
- Deactivation frees a slot under the published replacement policy. Start with one replacement per slot per billing period to discourage unlimited repository rotation without trapping honest migrations.
- Preflight failure and platform/provider failure never consume a run allowance. An admitted run records one idempotent usage event and reconciliation outcome.
- Customers see slot assignments, replacements, run allowances, and billing-period counters before confirming a change.
- Include reasonable LLM use within plan limits; do not sell raw tokens as the primary value metric.
- Keep viewer access generous because sharing evidence creates expansion.
- Use negotiated allowances for monorepos before inventing a complex weighting formula.
- An optional individual Builder plan can be tested later at USD 29-49/month only if usage data demonstrates retention.

Before self-service billing, add tests for repository rename/transfer/archive/delete, disconnect/reconnect, duplicate activation, replacement limits, plan upgrade/downgrade, proration policy, failed runs, webhook replay, and customer-visible reconciliation.

## Success metrics and product gates

### Verification standard

Every phase gate must name an accountable owner and produce a dated artifact: automated test report, security review, restore/deletion drill, usability study, deployment record, or signed product decision. “Implemented” without this evidence does not close a gate.

Use these definitions where the plan uses qualitative language:

- **Useful baseline:** a supported repository run is pinned to a commit, emits all template-required collector statuses (including explicit unknowns/errors), seals evidence, evaluates canonical scorecards, and lets the user open the source for each result. It does not mean the repository is generally “good.”
- **User understands and controls a setting:** at least four of five representative pilot users can locate it, predict whether data leaves the platform, change it, and verify the effective run behavior in a moderated task without operator intervention.
- **Reproducible environment:** an approved pipeline provisions a blank staging environment, applies migrations, deploys web/workers, passes health checks, and runs a fixture analysis with no undocumented console/database change.
- **Explain a run difference:** the comparison golden suite identifies every seeded manifest, input, collector, evidence, criterion, model, approval, cost, and artifact difference with no invented cause.
- **Bounded abuse cost:** every expensive operation has a numeric tenant/user/repository/IP-as-appropriate limit, and adversarial tests at ten times the allowed request volume remain within configured concurrency, storage, provider, and spend ceilings.
- **Ready to close:** the acceptance artifact links requirements, tests/drills, unresolved exceptions, owner, expiry, and rollback/failure policy.

### North-star metric

**Weekly verified repository reviews:** repositories where a scheduled or release-triggered run results in an accepted clean result, an acknowledged material delta, or a deterministically verified remediation.

### Activation

- At least 70% of qualified installs reach a successful first scan.
- Median time to a useful baseline is under 20 minutes for supported repositories.
- At least 40% of qualified trial workspaces accept a baseline.
- At least 60% of activated workspaces enable monitoring.

### Retention and value

- At least 50% of activated pilot workspaces review scheduled results during weeks 5-8.
- Track time saved per repository review and release-review lead time.
- Track findings acknowledged, assigned, waived with expiry, resolved, and regressed.
- Track report sharing and repository expansion within a workspace.

### Trust and quality

- Cross-tenant authorization failure rate: zero known escapes.
- Evidence-link integrity and reproducible manifest coverage: 100% for supported runs.
- Unsupported generated claim rate and user correction rate.
- Notification dismissal/noise rate.
- Deletion completion SLO and restore-without-resurrection pass rate.

### Business

- Paid pilot conversion and annual conversion.
- Gross retention, repository expansion, and net revenue retention.
- Cost and gross margin per active monitored repository.
- Sales cycle and security-review completion time.

### Operations

- Web/API availability target for GA: 99.9% monthly.
- Job acceptance without silent loss: 100% of acknowledged jobs.
- Queue age, success rate, retry rate, dead letters, provider failure, and unknown outcome rate.
- Cost/duration estimate accuracy and budget overrun rate.

If pilots do not repeatedly act on scheduled evidence, pause broad self-service work. Repackage Nexus Forge as a high-value episodic assurance workflow rather than pretending it is a continuously retained product.

## Delivery sequence

This estimate assumes three small engineering streams (trust/platform, orchestration/backend, product/frontend), one product designer, and part-time security/legal support. A smaller team should keep the order and execute serially rather than weakening gates.

| Phase | Indicative duration | Commercial state | Exit gate |
|---|---:|---|---|
| 0. Emergency containment | 2-4 weeks | Internal only; public/synthetic discovery | Dependency, GitHub binding, deterministic-only, data-transfer, and correctness blockers contained |
| 1. Pilot trust foundation | 8-12 weeks | Unpaid design partners; conditional paid commitments | All P1 tenancy, authentication, deletion, privacy, operations, audit, entitlement, activation, claim, monitoring, tax, legal, and support tests pass |
| 2. Orchestration foundation | 8-12 weeks | Assisted paid pilot | Profiles, preflight, manifests, artifact review, history, and comparison live |
| 3. Recurring value and billing | 6-10 weeks | Limited paid availability | Monitoring retention proven; entitlements and billing lifecycle pass |
| 4. Team workflow | 6-10 weeks | Self-service GA candidate | Collaboration, policies, integrations, support readiness |
| 5. Sandboxed verification | 6-10 weeks | Add-on beta | Dedicated worker and approval-bound verification certified |
| 6. Enterprise controls | Demand-driven | Enterprise contracts | SSO/SCIM, governance, compliance, and SLA evidence |

Before each phase starts, create a technical design, threat-model delta, migration/rollback plan, analytics plan, and customer-facing release criteria. Do not combine large tenant, billing, and execution migrations into one release.

## Paid launch gates

Paid limited availability requires objective evidence that:

- No known exploitable critical runtime dependency remains.
- GitHub installations cannot be bound without demonstrated authority.
- Cross-tenant access tests pass for API, jobs, exports, schedules, integrations, and billing.
- Role/action and step-up authentication tests pass for every privileged paid-pilot action.
- Private content cannot reach an external model without effective explicit policy.
- Project/workspace/account deletion is proven across active systems and backup lifecycle.
- Entitlements are enforced server-side before expensive work and at worker execution.
- Every run passes the minimum preflight and references an immutable admission manifest.
- Abuse controls prevent unbounded GitHub, model, storage, export, and sandbox cost.
- Production deployment is reproducible, monitored, backed up, and restore-tested.
- Security-relevant actions are attributable and exportable without sensitive payloads.
- CSP, origin protection, input bounds, and output rendering controls are enforced.
- Privacy, retention, subprocessors, terms, security overview, and incident contacts match actual behavior.
- Score/readiness language passes the ADR-0001 claim-calibration gate.
- Tax, contracting, invoicing, and support readiness are approved for each initial selling jurisdiction.
- Named owners and runbooks exist for security, privacy, billing, GitHub, provider, deletion, and recovery incidents.

Paid GA additionally requires:

- Repeated monitoring retention from pilot customers.
- Proven billing reconciliation and customer support workflow.
- Availability and incident targets met for an agreed observation period.
- Targeted independent penetration testing with critical/high findings resolved or formally accepted with expiration.
- Clear customer onboarding, usage, upgrade, downgrade, cancellation, export, and deletion experiences.

Privacy, tenant isolation, GitHub authority, and deletion failures are not eligible for routine launch exceptions.

## Trade-off resolutions

| Trade-off | Decision |
|---|---|
| Speed vs private repository support | Restrict scope or use deterministic-only mode; do not silently accept external-processing risk. |
| Immutable evidence vs deletion rights | Keep sanitized integrity metadata immutable; keep customer content separately deletable/encrypted. |
| User flexibility vs safety | Offer typed profiles/templates and bounded overrides, not arbitrary DAGs, prompts, or shell. |
| Automation vs trust | Automate deterministic read-only work; require approval for sandbox or external side effects. |
| More context vs privacy/cost | Select and hash minimal context; let authorized users expand scope deliberately. |
| Alert coverage vs noise | Notify on policy-defined material deltas, not every completed scan. |
| Canonical score vs customer policy | Preserve canonical scorecards; publish separately labeled governed policy views. |
| Billing availability vs correctness | Use local webhook-derived entitlements with a short grace period and reconciliation; never bypass checks. |
| Single owner vs launch speed | Introduce organization ownership now, even if early UI exposes a small role set. |
| AI quality vs reproducibility | Persist exact model/prompt/schema identity and citations; do not promise identical prose on rerun. |
| Fast execution vs cost control | Preflight and reserve quota before enqueueing; cap retries/concurrency and expose estimates. |
| Broad market vs focus | Prioritize team engineering assurance; keep Builder outputs as secondary value. |

## Explicit non-goals

- Autonomous coding or automatic merges.
- General-purpose repository chat.
- Arbitrary visual workflow/DAG construction.
- User-provided shell commands, system prompts, or executable plugins.
- LLM-generated evidence, readiness scores, policy decisions, or approvals.
- Developer productivity rankings or individual surveillance.
- A public capability marketplace before the private capability contract is mature.
- Becoming a secret manager, issue tracker, source-control system, observability platform, or SIEM.
- GitLab/Bitbucket support before GitHub activation and retention are proven.
- A fully flexible scorecard formula builder before canonical scorecards are calibrated.
- Mobile applications.

## First implementation slice

The first executable backlog should be:

1. In parallel, run ICP discovery using public/synthetic repositories and secure conditional pilot commitments without collecting private code.
2. Upgrade the vulnerable framework/dependencies and add the CI audit/SBOM gate.
3. Fix GitHub App authority-safe installation and repository selection.
4. Implement deterministic-only baselines, early evidence publication, private-repository inference defaults, explicit external-inference consent, and the minimum preflight/admission manifest.
5. Fix proof export, request error handling, failed-run visibility, workflow mutation validation, and human-state overwrite behavior.
6. Implement organization ownership, the deny-by-default role matrix, step-up authentication, and complete cross-/same-tenant negative tests.
7. Implement deletion/retention storage boundaries, customer deletion workflows, and restore-without-resurrection verification.
8. Implement attributed audit, CSP/origin/body protections, quotas/rate limits, contract entitlements, and customer-visible usage.
9. Add reproducible web/worker deployment, health checks, monitoring, backups, incident runbooks, and a restore drill.
10. Ship the privacy/trust center, legal/provider disclosures, guided onboarding, claim-calibrated score semantics, and paid-pilot tax/contract/support readiness.
11. Implement baseline acceptance, a durable weekly schedule, baseline comparison, and the bounded pilot email digest.
12. Run all Phase 0/P1 security, privacy, deletion, authorization, entitlement, abuse, accessibility, operations, and minimal-loop exit tests.
13. Only after step 12 passes, start up to five assisted paid pilots and measure willingness to pay, support burden, ROI, and weeks 5-8 retention.
14. During paid pilots, implement immutable PR/source provenance, profiles, preflight, run manifests, artifact review, history, and comparison.
15. Expand triggers/findings/integrations and implement Stripe subscriptions only after retention and limited self-service demand are demonstrated.

This order resolves the known trust trade-offs before increasing autonomy, cost, customer count, or commercial promises.

# Durable analysis workers

Analysis and merged-pull-request draft generation run outside the Next.js request lifecycle. The API only inserts an `AnalysisRun`, its five fixed `AnalysisStageRun` rows, and a `Job`, then returns `202 Accepted`.

## Deploying

1. Back up PostgreSQL.
2. Deploy Prisma migrations with the normal release process (`prisma migrate deploy`) **before** deploying application/worker code. Auth, durable execution, LLM telemetry, and evidence-scorecard migrations are additive and must be applied in timestamp order; legacy projection tables remain in place. Evidence ledger rows are append-only—methodology changes create a new run/version rather than updating history. See [`docs/evidence-scorecards.md`](../evidence-scorecards.md).
3. Deploy the web service.
4. Start one or more worker processes from the same release image:

```bash
npm run worker:analysis
```

Use `npm run worker:analysis -- --once` to claim at most one available job for smoke tests, cron-style operation, or controlled drains. Workers need the same database, model-provider, budget, and GitHub configuration as the web service.

Recommended environment:

```dotenv
NODE_ENV=production                     # required; development/test are also accepted
WORKER_ID=analysis-worker-a              # optional; generated when absent
ANALYSIS_JOB_LEASE_MS=60000             # minimum 5000
```

Workers fail closed when `NODE_ENV` is absent/invalid and reject a shared `GITHUB_TOKEN` in every mode. Private-repository collection uses repository-bound GitHub App installation tokens; configure the App credentials described in [GitHub App collection](github-app-collection.md).

### Free-tier pilot option: GitHub Actions

The public repository includes `.github/workflows/workers.yml`. It runs one
analysis job per scheduled invocation (`--once`) every five minutes, or on
manual dispatch, against the same PostgreSQL database as the Vercel web app.
GitHub schedules are best-effort and can be delayed or skipped; the 10-minute
job timeout also limits long analyses. Use an always-on worker host if you need
prompt queue processing or a service-level guarantee. The separate
`pilot-weekly.yml` schedules accepted-baseline work.

For that workflow, configure GitHub Actions repository secrets
`WORKERS_DATABASE_URL`, `GROQ_API_KEY`, `GITHUB_APP_ID`, and
`GITHUB_APP_PRIVATE_KEY_BASE64`. **BYOK requires the exact same
`LLM_USER_KEY_MASTER_SECRET` as the Vercel web deployment on the worker**;
otherwise the worker cannot decrypt user keys and may fall back to platform
keys. Set any other platform provider API keys on the worker if those providers
are enabled. Keep secrets in GitHub Actions, never in workflow YAML.

`npm run worker:sandbox` is a local synthetic-check prototype: it does not
execute the advertised checks and is blocked in production. Do not run it
against a production database or use its PASS results as independent evidence.
Real sandbox verification requires a separate isolated executor and an
approval/attestation workflow; it is not deployed by the free-tier schedule.

## Leasing, recovery, and retry

Claims use a single PostgreSQL `FOR UPDATE SKIP LOCKED` statement. Each claim gets a random lease token and increments `attemptCount`. The worker heartbeats at approximately one third of the lease interval. Expired `RUNNING` jobs become claimable by another worker. Every stage checkpoint, final compatibility publication, webhook artifact publication, and terminal job transition conditionally verifies the current lease token.

Transient failures use bounded exponential backoff (1 second, 2 seconds, 4 seconds, and so on, capped at 15 minutes). Jobs default to five attempts. Permanent failures and exhausted jobs enter `DEAD`; analysis runs become `FAILED`. Typed failure class, code, safe message, attempts, and stage state are available from the run status API.

## Cancellation

`POST /api/projects/:projectId/runs/:runId/cancel` records `CANCEL_REQUESTED` in PostgreSQL. Workers poll cancellation during provider calls, pass an abort signal to AI SDK calls, and lock/recheck the run immediately before publication. `SIGTERM`/`SIGINT` stops the worker from claiming another job; the current provider call is allowed to finish or the lease expires for recovery.

## Checkpoint and compatibility behavior

Immutable `ArtifactVersion` rows are written as stages succeed. Completed stages with a matching content hash are reused after a retry. Optional repository and release stages write explicit `SKIPPED` artifacts; their stale legacy projections are deleted only in the final successful publication. Legacy one-row-per-project artifact tables are updated together only in the final fenced success transaction, so a failed rerun cannot replace the prior good dashboard projection. `Project.activeAnalysisRunId` changes only in that same transaction.

## Model boundary and telemetry

Every analysis stage resolves a persisted provider/model tuple plus a stage-specific prompt ID/version and schema version. Stage resume requires the stage row and immutable artifact to match every persisted identity field. The default Groq model's strict structured-output capability is recorded as unknown, not claimed. AI SDK JSON-schema parsing, Zod validation, and one conservative fence/envelope repair are authoritative; repair never supplies missing values and invalid raw output is discarded.

`GROQ_ALLOWED_MODELS` defaults to only `GROQ_MODEL`. During a rolling model deployment, operators must temporarily include both the old persisted model and the new model until all old queued/retryable runs finish; otherwise old runs fail safely as unsupported.

Daily user/project token reservations are PostgreSQL-atomic and have a durable settlement row, making reconcile/release idempotent. `maxOutputTokens` is capped by the reservation. Successful calls and schema-invalid consumed responses reconcile usage before returning (fail-closed). Unknown token usage is conservatively charged at the full reservation, while reported overages are charged in full and block later calls beyond the daily cap. Safe usage telemetry is written afterward and is fail-open; stage checkpoints fall back to the reconciled reservation total when telemetry is absent. Telemetry never stores prompts, outputs, headers, API keys, provider bodies, or raw validation failures. Reservation release failures are logged generically and require operator reconciliation. The telemetry `attemptCount` records AI SDK generation steps; transport retry count is left unknown because AI SDK does not expose it on the result.

## Exactly-once limits

Database claims and publications are fenced and idempotent, but external model/GitHub calls are at-least-once: a process can crash after the provider accepted a request and before the stage checkpoint commits. This may incur duplicate provider cost. Token reservations cap concurrent exposure, but provider-side idempotency is not available. Webhook event/delivery uniqueness and artifact uniqueness prevent duplicate publication.

## Optional PostgreSQL invariant checks

Unit tests use repository fakes and do not require a database. In a disposable local PostgreSQL database (never the configured production database), verify:

- two concurrent run inserts for one project yield exactly one active run due to `AnalysisRun_one_active_per_project`;
- multiple workers claim distinct rows with `SKIP LOCKED`;
- an expired lease can be reclaimed and the old token cannot checkpoint or complete;
- migration rollback/restore procedures work against a fresh backup.

Run the automated suite only against an explicitly disposable local/CI database:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/nexus_forge_test npm run test:integration
```

The integration script refuses non-local hosts and requires a dedicated `nexus_forge_test`/`nexus_forge_ci` database name, maps that URL to `DATABASE_URL`, applies all migrations, then exercises the partial index, concurrent claims, stale fencing, reaper terminal states, cancellation, tuple constraints, immutable artifacts/evidence/criteria/scorecards, run-local evidence uniqueness, tenant-scope guards, and atomic AI budget reservation/reconciliation. Normal `npm test` remains database-free.

GitHub App reconciliation, fixed-SHA snapshots, private-repository installation tokens, check/review facts, and owner-scoped webhook draft retrieval are implemented with the hard caps documented in [GitHub App collection](github-app-collection.md).

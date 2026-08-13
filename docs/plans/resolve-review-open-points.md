# Plan: Resolve the Verified Open Points

Status: In progress
Date: 2026-08-12
Last verified: 2026-08-13
Companion: [ADR-0001](../adr/0001-evidence-first-repository-intelligence.md)

## Implementation progress

- W2 complete: public generated copy now says evidence-first / LLM-assisted while accurate coding-agent references and internal identifiers remain unchanged.
- W4 complete: [ADR-0002](../adr/0002-product-positioning-and-naming.md) records the naming history without rewriting Git history, and the README links it.
- W5 complete: the [webhook security runbook](../operations/webhook-security.md) documents the session-less HMAC trust model, bounded raw-body flow, replay handling, and a deterministic signed request.
- W6 code gates pass: `npm run typecheck`, `npm run lint`, and `npm test` (26 files / 186 tests) pass. `npm run build` passes when supplied production-valid Better Auth URL, secret, and OAuth values; the local `.env` intentionally does not contain deployable production credentials. Browser smoke returned `200` for `/`, found evidence-first copy, and returned `401` for unauthenticated `/api/projects`.
- W3 is partially verified: Docker 29.7.2 is available, sandbox unit coverage passes in the full suite, and no disposable worktrees remain. A real sandbox E2E still requires an approved digest-pinned `QUALITY_SANDBOX_IMAGE`.
- W1 remains open: the large remediation working tree has not been committed. Preserve it and obtain explicit approval before creating the proposed logical commit series.

## Verified state (evidence snapshot, not aspiration)

A full audit against the four harsh-review findings was run on the working tree
(2026-08-12). The 8 consolidated claims were each checked against source:
HMAC, auth, evidence scorecards, deterministic architecture map, retry-with-repair,
pinned model versions, mock-based LLM-boundary tests, and the honest README are all
**implemented but NOT committed**. `git status --porcelain` shows ~50 modified
tracked files and ~60 untracked files (whole new libs: `src/lib/ai/`, `src/lib/auth/`,
`src/lib/evidence/`, `src/lib/execution/`, `src/lib/quality/`, `src/lib/repository/`,
21 test files, 5 migrations, `docs/`, `evals/`, `scripts/`, `src/app/login/`).

Only one review claim remains visibly true in code: the analysis pipeline is five
sequential LLM invocations with no tool calling or agentic loop. That is no longer a
credibility problem because the README and UI say "five-stage LLM-assisted analysis";
the remaining "agent" strings are either accurate (coding-agent prompts, agent-chat
logs) or internal identifiers.

## Work items

### W1 — CRITICAL: Commit the uncommitted review-fix work

The entire remediation (auth+ownership, durable worker, evidence scorecards, webhook
HMAC, LLM-boundary telemetry, snapshot collection, tests, docs, migrations) exists only
in the working tree. A single `git reset --hard` or machine failure loses every fix.

Steps:
1. Confirm ignore coverage (already verified): `.env`, `dev-server*.log`,
   `dev-server*.pid`, `/.next/` are ignored; no secrets should be staged.
2. `git diff --stat` + scan staged content for secret patterns before staging
   (`ghp_`, `sk_live`, `BEGIN .*PRIVATE KEY`). There must be none.
3. Commit in logical groups (recommended), in order:
   a. `feat: auth and ownership controls` — `src/lib/auth*`, `src/app/api/auth/`, `src/app/login/`, authorization tests, `prisma/migrations/..._auth_ownership_controls/`
   b. `feat: durable analysis execution` — `src/lib/execution/`, pipeline, worker scripts, durable tests
   c. `feat: evidence scorecards` — `src/lib/evidence/`, scorecard tests/docs, `..._evidence_scorecards/` migration
   d. `security: webhook HMAC and bounded body` — `webhook-security.ts`, webhook route/tests
   e. `feat: github app collection with commit pinning` — `src/lib/github/`, snapshot tests
   f. `feat: quality orchestrator sandbox` — `src/lib/quality/`, dispose-worktree sandbox, tests, scripts
   g. `test: LLM-boundary mock suite` — `ai-sdk-mock-language-model.test.ts`, `ai-runner-production.test.ts`, `no-llm-scores.test.ts`
   h. `docs: evidence-first README, ADR, operations` — final commit
4. Never commit `.env`.

Verification:
- `git status --porcelain` returns empty (ignored files aside).
- `git log --oneline -15` shows the groups; `git diff HEAD --stat` is empty.
- `git grep -l -E "ghp_|sk_live" $(git rev-parse HEAD)` finds nothing.

### W2 — Terminology parity: internal vs public "agent" usage (P2 polish)

Verified remaining "agent" occurrences are either accurate (coding-agent prompts,
agent-chat logs in `src/app/page.tsx`, `intake/page.tsx`, `layout.tsx`) or internal
identifiers (`src/lib/agents/*.ts`, `AGENT_SYSTEM_INSTRUCTIONS`, `AgentRunnerAdapter`,
`agentSchemaVersion` column).

Decision: rename only what a reviewer or customer reads, skip internals.
1. `src/lib/agents/proof-of-work-agent.ts` (generated draft copy lines ~34/49/54/59):
   replace "copyable AI agent prompts" / "AI-native" phrasing with LLM-stage phrasing
   ("copyable per-task prompts", "five-stage LLM-assisted pipeline").
2. Do NOT rename internal modules, `agentSchemaVersion`, or type names — rename would
   churn ~25 files and require a Prisma migration for zero claim impact. Record this
   decision here for future reviewers.
3. PR-draft wording in the webhook worker / release notes must use "stage", not "agent".

Verification:
- `npm test` green (proof-of-work + release tests still pass after string edits).
- Manual grep of `src/app` shows only accurate agent-log / coding-agent mentions.
- No schema change; `git diff` for this item touches ≤2 files.

### W3 — Quality orchestrator: verify the real-execution path end to end

Verified state: fully implemented, not yet exercised against a real image.
`src/lib/quality/sandbox.ts` runs a disposable `git worktree add --detach HEAD`,
applies LLM-proposed edits (`applyEdits` with exact-once match + path validation),
executes allowlisted commands (`npm test -- --run`, `typecheck`, `lint`, `build`) in a
hardened Docker container (`--network=none`, `--read-only`, `--cap-drop=ALL`,
`--pids-limit`, sha256-pinned image), returns the patch + statuses for human review,
and removes the worktree in `finally`. Access is gated by a kill switch
(`QUALITY_ORCHESTRATOR_ENABLED`), `NODE_ENV=production` block, and email allowlist
(`src/lib/quality/access-policy.ts`). `src/app/api/orchestrate/` routes exist.

Steps:
1. Confirm `docker version` works locally (Windows: WSL2 backend) — if not, document
   as verification-blocked with the recipe, do not weaken the sandbox for the host OS.
2. Build/pull the qual image with a pinned sha256; export
   `QUALITY_SANDBOX_IMAGE=repo@sha256:…`.
3. Run the sandbox test file and add any missing cases: path traversal (
   `validateSandboxRelativePath`), command allowlist rejection, edit count/bounds,
   exact-once match failure, worktree cleanup on error.
4. Manual E2E (recommended): start orchestrate with `QUALITY_ORCHESTRATOR_ENABLED=true`
   + allowed email, send one real edit proposal, confirm the route returns
   `reviewRequired: true` statuses + patch and that the worktree is gone afterwards.
5. Document the recipe in `docs/operations/quality-sandbox.md` (exists; extend with the
   verified image + commands).

Verification:
- `npx vitest run quality-sandbox` green (existing + new cases).
- One real orchestrate run in dev with statuses `[PASS|FAIL]` and a produced patch.
- `git worktree list` shows no leftover `nexus-forge-quality-*` worktrees.

### W4 — Rebrand history: decision record, no history rewrite

Verified: `git log` still shows Praxis→Hermes (`f999b0e`, `3b8d9f0`) and Hermes→Nexus
Forge (`d7db98a`). Only a history rewrite would remove it; force-pushing is rejected
by policy and would destroy the useful lineage for review.

Decision: add `docs/adr/0002-product-positioning-and-naming.md` — one paragraph each:
why the tool started as a hackathon practice-ops tool ("Praxis"), became the agent
plumbing experiment ("Hermes"), and landed on evidence-first repo intelligence
("Nexus Forge") — the naming tracks the thesis, not chaos. Link it from README's
"Product positioning".

Verification: ADR file exists, README cross-links it, `git log` untouched.

### W5 — Webhook interview-readiness documentation

Code is done (HMAC via `timingSafeEqual`, bounded body, delivery-ID validation,
schema parse, dedupe via unique delivery). The gap is narrative: an interviewer can
ask why the webhook is session-less.

Steps:
1. Add `docs/operations/webhook-security.md`: trust model (HMAC-authenticated
   system-to-system, no user session), the exact `X-Hub-Signature-256` flow, body
   cap + replay handling (unique `deliveryId`), and a working `curl` example with a
   hardcoded signed payload so the answer is rehearsed.
2. Link from README "Webhooks" env row.

Verification: doc exists; `npx vitest run github-webhook` green (signature, missing
header, bad signature, oversized body, replay paths).

### W6 — Final verified gate

1. `npm run build && npm run typecheck && npm run lint && npm test` — all four CI
   checks must pass (currently: 26 files / 186 tests green).
2. Browser smoke (dev server on :3000): home page renders evidence-first copy,
   sign-in links exist, projects page requires session (401 without cookie).
3. `git status --porcelain` empty.

## Non-goals

- Rewriting git history (W4 decision covers this).
- Renaming internal identifiers / DB columns from "agent" to "stage" (W2 decision).
- Weakening the sandbox to run host-side when Docker is missing (W3).
- Adding tool-calling or an agentic loop to the five-stage pipeline — out of scope
  for claim-repair; the claims are already consistent with the implementation.
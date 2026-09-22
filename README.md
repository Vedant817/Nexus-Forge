# Nexus Forge

**Evidence-first repository intelligence**

Nexus Forge collects verifiable repository evidence, turns it into versioned readiness findings, and uses LLMs only to explain, organize, and draft from that evidence.

> The current implementation is being migrated toward this architecture. See [ADR-0001](docs/adr/0001-evidence-first-repository-intelligence.md) for the trust boundary and the limitations below for what is not yet complete.

## What it does

- **Source intake** — Accepts learning material, repository URLs, and pull-request URLs.
- **Five-stage LLM-assisted analysis** — Distills sources, organizes repository context, drafts workflows, reviews release risks, and creates review-ready portfolio copy.
- **Versioned deterministic scorecards** — Evaluates persisted evidence with PASS/FAIL/UNKNOWN/N/A criteria and explicit completeness. A declared test or Dockerfile is not treated as proof that tests or builds passed.
- **Repository dependency map** — Visualizes repository-derived nodes and edges. Until semantic extraction is broad enough, this is not presented as a complete architecture model.
- **Review-ready drafts** — Produces resume and LinkedIn drafts for human review; it does not publish automatically.

## Trust model

Repository content is untrusted input. Deterministic collectors are responsible for evidence and scorecard statuses. LLM stages may explain, organize, and draft only from supplied evidence references; they are not authoritative evidence sources and must not assign readiness scores.

The model boundary uses AI SDK `Output.object` with stage-specific prompt/schema versions, recursive pre-provider secret redaction, a separate untrusted-data envelope, Zod validation, and one conservative JSON-envelope repair attempt that never invents fields. Invalid output becomes a typed safe failure; raw invalid output is never stored. Token budgets are reconciled before a successful result is returned. Safe usage telemetry is fail-open and stores no prompts, completions, headers, provider bodies, or secrets.

Groq native structured-output conformance for the default `llama-3.3-70b-versatile` model is **not attested**. The registry records this capability as unknown; deterministic AI SDK parsing and schema validation are the enforcement boundary.

A finding should distinguish:

- `pass`
- `fail`
- `unknown`
- `not_applicable`

and include its commit SHA when known, source reference, observation time, collector version, and confidence. See [the scorecard methodology](docs/evidence-scorecards.md), [evaluation rubric](docs/evaluation.md), and [roadmap](docs/roadmap.md).

## Current limitations

- Analysis currently runs on demand after an analysis request.
- Legacy projection tables retain integer score columns for compatibility; `scoreStatus`, completeness, and the active-run scorecard are authoritative.
- Provider calls can be repeated after worker crashes; fenced checkpoints prevent duplicate publication, not duplicate provider billing.
- Safe usage telemetry is best-effort after fail-closed budget reconciliation and can be absent during a telemetry database outage.
- Dependency maps parse JS/TS syntax only; computed loading, unresolved aliases, unsupported languages, and reached bounds are disclosed as incomplete. See [dependency maps](docs/dependency-maps.md).
- Portfolio and social copy is a draft requiring review; generated prose is never promoted to verified evidence.
- Web quality orchestration is patch-proposal-only. Deterministic checks require the dedicated [disposable worktree/container sandbox](docs/operations/quality-sandbox.md) and human patch review.
- GitHub App collection pins repository snapshots and PR checks/reviews to immutable SHAs, but REST hard caps (50,000 collected tree entries, 3,000 PR files, 1,000 recent check suites, and 100 MiB Git blob support) are surfaced as incomplete evidence rather than silently ignored.
- Connecting a repository uses signed single-use state bound to the exact session/project, cross-checks the GitHub user's installation authority through the same GitHub App, requires repository administrator permission, and validates a fresh repository-scoped installation token before binding. Organization policy still determines who may approve the App installation.

## Tech stack

- Next.js 16 App Router and React 19
- TypeScript, Tailwind CSS, and shadcn/ui
- PostgreSQL via Prisma 7
- Vercel AI SDK 7 with Groq
- Vitest

## Getting started

### Prerequisites

- Node.js 22+
- npm
- PostgreSQL

```bash
git clone <your-repo-url> nexus-forge
cd nexus-forge
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Open <http://localhost:3000>.

## Configuration

| Variable | Required | Description |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GROQ_API_KEY` | For LLM stages | Groq API key |
| `GROQ_MODEL` | No | Default model used by the stage registry |
| `GROQ_ALLOWED_MODELS` | No | Comma-separated execution allowlist; defaults to only `GROQ_MODEL` |
| `GITHUB_APP_ID` | For repository collection | GitHub App identifier used to sign short-lived app JWTs |
| `GITHUB_APP_PRIVATE_KEY` / `_BASE64` | For repository collection | GitHub App private key; configure exactly one secret form |
| `GITHUB_WEBHOOK_SECRET` | For webhooks | Secret used to authenticate raw webhook bytes; see the [webhook security runbook](docs/operations/webhook-security.md) |
| `ANALYSIS_MAX_CONTENT_LENGTH` | No | Maximum accepted source length |
| `MAX_SOURCES_PER_PROJECT` | No | Maximum sources per project |

See `.env.example` for the complete evolving configuration surface.

## Durable workers

Analysis requests return `202 Accepted` and require one or more separate worker processes:

```bash
npm run worker:analysis
```

See [durable analysis worker operations](docs/operations/durable-analysis-workers.md) for migration order, scaling, leases, retries, cancellation, graceful shutdown, and exactly-once limitations.

## Verification

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

CI requires all four checks.

## Architecture direction

```text
GitHub App / uploaded sources
             │
             ▼
   deterministic collectors
             │
             ▼
 versioned evidence ledger
             │
       ┌─────┴─────┐
       ▼           ▼
 scorecards     constrained LLM stages
       └─────┬─────┘
             ▼
 immutable analysis artifacts
```

The LLM may explain evidence, but it never creates evidence or scores itself. Repository collection uses repository-scoped, one-hour GitHub App installation tokens; shared personal tokens are rejected.

## Product positioning

> Nexus Forge is an evidence-first repository intelligence tool built with Next.js and PostgreSQL. It snapshots analysis inputs, derives versioned readiness findings and dependency maps from collected repository evidence, and uses schema-validated LLM stages to turn those findings into workflows and review-ready portfolio drafts. Repository and pull-request collection is pinned to immutable commit SHAs, with every REST cap represented as an explicit completeness limitation.

The project's naming history follows the evolution of that thesis; see [ADR-0002](docs/adr/0002-product-positioning-and-naming.md).

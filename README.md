# Hermes Forge

**Knowledge-to-Ship Operator for AI-native builders.**

Turn YouTube transcripts, blog posts, GitHub repos, PRs, and AI coding-agent chats into executable build workflows, release-readiness reports, and portfolio-ready proof-of-work packs.

Built for the **Gappy AI National AI Hackathon** powered by Lemma SDK.

## Features

- **Intake** — Paste transcripts, blogs, agent chat logs, GitHub repos, and PR URLs
- **Knowledge Distillation** — Extract key concepts, patterns, buildable tasks from learning sources
- **Repo Analysis** — Score repository maturity on README, tests, CI/CD, Docker, env safety
- **Workflow Board** — Kanban-style build tasks with copyable AI agent prompts
- **Release Readiness** — Evidence-based scoring: go / go-with-fixes / no-go
- **Proof Pack** — Portfolio summary, resume bullet, demo script, interview explanation, LinkedIn post
- **Markdown Export** — Export workflow and proof pack as downloadable .md files

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Validation:** Zod
- **Database:** SQLite via Prisma + better-sqlite3
- **GitHub Integration:** Real GitHub REST API fetches
- **Testing:** Vitest
- **Build Tool:** Turbopack

## Architecture

```
/app          — Next.js App Router pages and API routes
  /api        — REST API endpoints
  /projects   — UI pages
/components   — Reusable UI components (shadcn/ui)
/lib
  /agents     — 5 AI agents (knowledge distiller, repo context, workflow planner, release readiness, proof of work)
  /workflows  — Main pipeline orchestrator
  /github     — GitHub API integration
  /lemma      — Lemma SDK adapter layer
  /security   — URL safety, prompt injection guard, rate limiting, audit log, secret redaction
  /scoring    — Evidence-based scoring engines
  /export     — Markdown export
  /db         — Database client
  /config     — Environment configuration
/prisma        — Database schema and migrations
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Clone and install
cd hermes-forge
npm install

# Set up environment
cp .env.example .env
# Edit .env if needed (defaults work for local development)

# Initialize database
npx prisma migrate dev --name init

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `file:./hermes-forge.db` | SQLite database path |
| `GITHUB_TOKEN` | No | — | GitHub personal access token (for higher API rate limits) |
| `LEMMA_API_KEY` | No | — | Lemma SDK API key (from lemma.work) |
| `LEMMA_POD_ID` | No | — | Lemma SDK pod ID |
| `LEMMA_BASE_URL` | No | `https://api.lemma.work` | Lemma API base URL |
| `NODE_ENV` | No | `development` | Environment mode |
| `ANALYSIS_MAX_CONTENT_LENGTH` | No | `100000` | Max content size for sources |
| `MAX_SOURCES_PER_PROJECT` | No | `20` | Max sources per project |
| `CORS_ORIGINS` | No | — | Comma-separated allowed origins |

## Usage

1. **Create a project** — Name it and optionally link a GitHub repo/PR
2. **Add sources** — Paste transcripts, blog text, agent chat logs, or upload .txt/.md files
3. **Add repo/PR URLs** — Link GitHub repository and optional PR
4. **Run analysis** — The pipeline runs 5 agents
5. **View results** — Knowledge summary, workflow board, repo review, release report, proof pack
6. **Export** — Download workflow or proof pack as Markdown

## API Endpoints

### Projects
- `POST /api/projects` — Create project
- `GET /api/projects` — List projects
- `GET /api/projects/[id]` — Get project with all data
- `PATCH /api/projects/[id]` — Update project
- `DELETE /api/projects/[id]` — Delete project

### Sources
- `POST /api/projects/[id]/sources` — Add source
- `GET /api/projects/[id]/sources` — List sources
- `DELETE /api/projects/[id]/sources/[sourceId]` — Delete source

### Analysis
- `POST /api/projects/[id]/run-analysis` — Run pipeline
- `GET /api/projects/[id]/knowledge` — Get knowledge summary
- `GET /api/projects/[id]/repo-analysis` — Get repo analysis
- `GET /api/projects/[id]/workflow` — Get workflow
- `GET /api/projects/[id]/release-report` — Get release report
- `GET /api/projects/[id]/proof-pack` — Get proof pack

### GitHub
- `POST /api/github/repo-context` — Fetch repo context
- `POST /api/github/pr-context` — Fetch PR context

### Export
- `GET /api/projects/[id]/export/workflow.md` — Export workflow as markdown
- `GET /api/projects/[id]/export/proof-pack.md` — Export proof pack as markdown

## Security

- **URL Safety:** Only HTTPS github.com URLs allowed; SSRF protection prevents access to private IPs/localhost
- **Prompt Injection Guard:** Detects instruction override, secret extraction, command execution attempts in source content
- **Secret Redaction:** GitHub tokens, API keys, and credentials are automatically redacted
- **Rate Limiting:** Analysis endpoint limited to 3 requests per minute per project
- **Audit Logging:** All important actions logged to database
- **Input Validation:** Zod validation on all API inputs with content size limits

## Testing

```bash
npm run test        # Run tests
npm run test:watch  # Watch mode
npm run lint        # Lint
npm run typecheck   # Type check
```

## Lemma SDK Integration

Hermes Forge uses the **real [Lemma SDK](https://www.npmjs.com/package/lemma-sdk)** (`lemma-sdk@0.5.0`) as its primary infrastructure layer:

- **Datastore** — Project data managed via `LemmaClient.records` (CRUD on Lemma tables)
- **Document Store** — Source content stored via `LemmaClient.files` (file upload/download)
- **Agent Runner** — 5 specialized agents run via Lemma's `AgentController` with LLM-powered conversations
- **Auto-detection** — When `LEMMA_API_KEY` and `LEMMA_POD_ID` are set, Lemma SDK is used automatically. Falls back to local Prisma/rule-based agents when credentials are absent.

Each agent has a system prompt that instructs the Lemma AI agent to produce structured JSON output matching the Zod validation schemas. The pipeline orchestrator selects the Lemma workflow path when configured, or the local path otherwise.

## Submission Notes

- **No fake scores** — All scores are computed from actual evidence
- **No hardcoded output** — All analysis results are generated from real inputs
- **No hardcoded secrets** — All configuration via environment variables
- **Working locally** — SQLite database with full local functionality
- **Production ready** — Environment validation, error handling, rate limiting

## License

MIT

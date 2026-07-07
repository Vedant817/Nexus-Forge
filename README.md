# Nexus Forge

**The AI-Native Knowledge-to-Ship Orchestrator**

Turn fragmented learning—YouTube transcripts, technical blogs, GitHub repos, PRs, and AI coding-agent chat logs—into **executable build workflows, release-readiness reports, and portfolio-ready proof-of-work packs**.

## The Problem With AI Tooling Today

Modern AI development is fragmented. You use ChatGPT or Claude to learn a concept and plan an architecture. You use Cursor or GitHub Copilot to write the code. But what about everything else? 
- Who checks if your repo is actually production-ready? 
- Who tracks the "gap" between what you planned and what you built? 
- Who writes the portfolio updates, resume bullets, and LinkedIn posts to prove your work?

## The Solution: Nexus Forge

Nexus Forge doesn't just write code—it manages the **entire builder journey**. It is an end-to-end orchestrator that bridges the gap between raw knowledge and a shipped, portfolio-ready product.

### Core Features

- **Intake Engine** — Paste YouTube transcripts, blog posts, agent chat logs, GitHub repos, and PR URLs directly into the Forge.
- **Knowledge Distillation** — Extracts key concepts, architectural patterns, and actionable build tasks from raw learning sources.
- **Repo Context Analysis** — Scores your repository's maturity based on actual evidence (README quality, test coverage, CI/CD pipelines, Docker setup, and environment safety).
- **Workflow Planner** — Generates a Kanban-style build board. Every task includes a **copyable AI agent prompt** that you can paste directly into coding agents like Cursor or Claude Code.
- **Release Readiness Reviewer** — Provides evidence-based scoring (Go / Go-with-fixes / No-Go) highlighting the exact gaps preventing a production release.
- **Proof-of-Work Generator** — Automatically generates a portfolio summary, resume bullets, demo scripts, technical interview explanations, and LinkedIn posts.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Validation:** Zod
- **Database:** PostgreSQL (Neon) via Prisma (`@prisma/adapter-pg`)
- **Agent Orchestration:** Vercel AI SDK (`ai`) + Groq (`@ai-sdk/groq`)
- **GitHub Integration:** Real GitHub REST API fetches
- **Testing:** Vitest
- **Build Tool:** Turbopack

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Clone and install
git clone <your-repo-url> nexus-forge
cd nexus-forge
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Neon Database URL and Groq API Key

# Initialize database
npx prisma migrate dev --name init

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Neon PostgreSQL connection string (`postgresql://...`) |
| `GROQ_API_KEY` | Yes | — | Groq API Key for agent inference |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model to use for agents |
| `GITHUB_TOKEN` | No | — | GitHub personal access token (for higher API rate limits) |
| `NODE_ENV` | No | `development` | Environment mode |
| `ANALYSIS_MAX_CONTENT_LENGTH` | No | `100000` | Max content size for sources |
| `MAX_SOURCES_PER_PROJECT` | No | `20` | Max sources per project |
| `CORS_ORIGINS` | No | — | Comma-separated allowed origins |

## AI Infrastructure

Nexus Forge is powered by the **Vercel AI SDK** and **Groq**:
- **Agent Pipeline** — 5 specialized AI agents run continuously in the background via `@ai-sdk/groq` using the ultra-fast `llama-3.3-70b-versatile` model.
- **Structured Output** — Agents use Vercel AI SDK's `generateText()` paired with strict `zod-to-json-schema` injection to guarantee pristine JSON responses for the UI without hallucinations.

## Security Features

- **URL Safety:** Only HTTPS github.com URLs allowed; SSRF protection prevents access to private IPs/localhost.
- **Prompt Injection Guard:** Detects instruction overrides, secret extraction, and command execution attempts in source content.
- **Secret Redaction:** GitHub tokens, API keys, and credentials are automatically redacted before hitting the LLM.
- **Rate Limiting:** Analysis endpoints are limited to 3 requests per minute per project.
- **Input Validation:** Zod validation on all API inputs with strict content size limits.

## Testing

```bash
npm run test        # Run tests
npm run test:watch  # Watch mode
npm run lint        # Lint
npm run typecheck   # Type check
```





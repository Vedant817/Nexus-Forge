# Roadmap

## Near term

- Add commit-pinned fixture repositories for the published evaluation seed set.
- Add virtual `tsconfig`/`jsconfig` path mapping and workspace package resolution to dependency extractor v2.
- Add a reviewed GitHub App installation-selection UI around the existing authenticated reconciliation API.
- Add scheduled GitHub App delivery recovery and installation permission reconciliation.
- Add retention/archival administration that preserves sealed ledgers.

## Later

- Additional deterministic extractors for Python, Go, Rust, and JVM ecosystems.
- Dedicated sandbox worker service with admission control, image policy, syscall filtering, artifact signing, and patch approval workflow.
- Organization teams/roles beyond single-owner tenancy.
- Collector cache persistence using ETags partitioned by installation and repository scope.

Every roadmap item must preserve the core boundary: collectors establish evidence; deterministic registries establish criterion status and score; LLMs explain and draft from that evidence only.

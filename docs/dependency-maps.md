# Deterministic dependency maps

Dependency maps are derived from commit-pinned repository file snapshots without model inference or repository execution. The versioned TypeScript compiler parser recognizes static imports, re-exports, import-equals, literal dynamic imports, and literal `require()` calls in supported JS/TS extensions.

Nodes use semantic IDs (`file:<path>`, `external:<package>`, and hashed unresolved IDs). Edges include importer evidence IDs and source line/column. Ordering, IDs, and grid coordinates are deterministic. The active run stores the canonical map as an immutable `DEPENDENCY_MAP` artifact; the architecture GET endpoint is read-only.

## Completeness

Computed module specifiers, malformed source, unsupported languages, unresolved relative modules, GitHub snapshot truncation, and parser/file/byte/edge bounds set `complete=false` and produce diagnostics. External package nodes represent syntax-level package references; Nexus Forge does not execute package resolution against host `node_modules` and does not claim runtime reachability.

Initial resolution covers relative extension and index candidates. Full `tsconfig` path aliases, package exports, and multi-language semantic graphs are future extractor versions and must never be silently inferred by an LLM.

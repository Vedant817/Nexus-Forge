# Evidence lifecycle (commit-pinned)

Repository collection pins an immutable commit SHA; PR collection pins the PR
head SHA with changed files, checks, and reviews stored as immutable
`PullRequestSnapshot` records. Source evidence carries content hash, byte count,
content type, and snapshot identity. Every record carries collector observation
time, collector ID, and exact collector version.

Generated findings carry bounded citation objects (`claim`, `evidenceIds`,
`limitations`). Unsupported references are removed and visibly marked. Sealed
deterministic evidence is never mutated by later generation failures.

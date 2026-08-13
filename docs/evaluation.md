# Evaluation rubric

Nexus Forge is evaluated on evidence correctness, security, determinism, durability, and disclosure—not on persuasive prose.

## Release gates

| Dimension | Gate |
|---|---|
| Tenancy | Cross-owner project/run/source/evidence/artifact IDs return 404 and never disclose nested records. |
| Webhooks | Raw-body HMAC, delivery replay, installation/repository identity, and lifecycle disable tests pass. |
| Durability | Partial active-run uniqueness, SKIP LOCKED claims, token fencing, cancellation, terminal recovery, and immutable artifacts pass on disposable PostgreSQL. |
| Evidence | Missing signals are UNKNOWN, N/A is scope-proven, every PASS/FAIL links evidence, arithmetic is deterministic, and sealed ledger mutation fails. |
| LLM boundary | Real AI SDK mock-model tests validate schema parsing, repair, redaction, typed failures, budgets, and safe telemetry. No model schema owns a score or criterion status. |
| GitHub | Snapshot uses one immutable SHA, truncated trees fall back, pagination/caps are explicit, shared PATs are rejected. |
| Dependency map | Shuffled input gives byte-identical topology/layout; unresolved/computed imports make completeness false; no AI provider is imported. |
| Quality execution | Web path never mutates a checkout. Sandbox path uses a disposable worktree and pinned, networkless, non-root, resource-limited container and returns a review patch. |
| Claims | README/UI/API language matches implemented semantics and lists hard caps/residual risks. |

## Seed set

`evals/seed-set.json` defines reviewable fixture expectations. CI unit tests currently embody these cases. Future fixture repositories must be vendored or commit-pinned with license and provenance; mutable public repository HEADs are unsuitable for release gating.

## Metrics

Track: criterion-status agreement against hand-labeled fixtures; evidence-link precision; unknown-rate by collector limitation; snapshot and dependency-map determinism hashes; stage retries and token usage; cancellation latency; and false-positive/false-negative secret-redaction probes. Generated prose is reviewed for attribution and unsupported-claim rate, but never used as evidence correctness ground truth.

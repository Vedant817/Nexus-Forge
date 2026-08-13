# ADR-0001: Evidence-first repository intelligence

- **Status:** Accepted
- **Date:** 2026-06-26

## Context

The original product language described five prompts as autonomous agents and allowed model output to act as repository evidence and readiness scoring. The production path also lacked durable execution, commit-level provenance, and a strict separation between untrusted repository content and system instructions.

Those properties make findings difficult to verify and create avoidable security, reliability, and credibility risks.

## Decision

Nexus Forge is an evidence-first repository intelligence system.

1. Deterministic collectors own repository and CI observations.
2. Every finding records a `pass`, `fail`, `unknown`, or `not_applicable` status plus evidence references, commit SHA, observation time, collector version, weight, confidence, and collection errors.
3. Missing access is `unknown`, not an inferred failure.
4. LLM stages may explain, organize, and draft from evidence IDs. They do not create evidence, choose their own evidence, or assign readiness scores.
5. Analysis runs and successful artifacts are immutable and versioned. A failed rerun never deletes the last successful artifact.
6. Repository content is untrusted data. Secrets are redacted before provider calls, and source content is separated from system instructions.
7. Public claims must describe observed behavior and explicitly state limitations.
8. Each LLM stage has explicit prompt and schema identities. The provider capability registry does not claim strict structured-output support without attestation; deterministic parsing, one non-inventive envelope repair, and schema validation form the enforcement boundary.
9. AI budget accounting is fail-closed. Safe telemetry is recorded separately and is fail-open so an observability outage does not discard a valid, already-accounted model result. Telemetry never includes prompts, completions, raw invalid output, headers, secrets, or provider bodies.

## Consequences

- Existing `maturityScore`, `releaseScore`, and `proofScore` fields are legacy compatibility projections populated only from active-run deterministic scorecards. New consumers use normalized scorecards, criterion results, evidence IDs, and completeness directly.
- Repository maps are called dependency maps until supported extraction justifies broader architectural claims.
- Background analysis requires a durable run/job model rather than request-lifetime callbacks.
- New collectors, formulas, prompts, schemas, and model policies require explicit versions and production-path tests.
- Deterministic weighted rollups are nullable completeness summaries, not calibrated quality predictions. Nexus Forge must not attach product claims or pass thresholds to them without a labeled evaluation set and published calibration results.

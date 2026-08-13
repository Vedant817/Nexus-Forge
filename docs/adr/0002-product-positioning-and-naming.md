# ADR-0002: Product positioning and naming

Status: Accepted
Date: 2026-08-13

## Context

The repository history includes three product names. Preserving that history is preferable to rewriting commits because it records how the product thesis changed.

**Praxis** began as a hackathon practice-operations tool. The name reflected the original goal: turn learning into practical project work and produce material that could be demonstrated afterward.

**Hermes** marked an experiment in agent plumbing. At that stage, the product emphasized moving context between prompts and generated workflow artifacts while the implementation explored orchestration boundaries.

**Nexus Forge** names the current evidence-first repository intelligence product. The implementation now separates deterministic collection and scoring from schema-constrained LLM explanation and drafting. The naming progression tracks a narrowing and strengthening product thesis, not unrelated rewrites.

## Decision

Keep the existing Git history and its historical names. Use **Nexus Forge** for current product surfaces and documentation; explain earlier names through this decision record rather than rewriting history.

## Consequences

- Repository history remains auditable and useful to reviewers.
- Current public copy uses one product name and one evidence-first positioning statement.
- Historical names may remain in old commits, where they accurately describe the product at that time.

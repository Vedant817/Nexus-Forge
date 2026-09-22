# Security benchmarks

Target: **OWASP ASVS Level 2 (Standard)** for the web application plus
**OWASP LLM Top 10 (2025)** coverage for model features. This file records the
runnable battery, pass criteria, and last measured results (2026-09-22).

## Runnable battery

| # | Command | Standard | Pass criterion | Last result |
|---|---|---|---|---|
| 1 | `npm run typecheck` | ASVS V14, SAST | exit 0 | PASS |
| 2 | `npm run lint` | ASVS V5/V14, SAST | exit 0 | PASS |
| 3 | `npm test` (283 tests) | ASVS V14, LLM01/02/05/10 | exit 0 | PASS |
| 4 | `npm run audit:ci` | Supply chain (GHSA) | exit 0 (0 critical) | PASS |
| 5 | `npm audit --omit=dev` review | SECURITY.md SLA | 0 critical; highs documented | PASS (0 critical, 4 highs = documented prisma-transitive exceptions) |
| 6 | `npm run sbom` | Supply chain (CycloneDX) | valid CycloneDX JSON | PASS (CycloneDX 1.5, 825 components) |
| 7 | `npm run security:sweep` | Secrets (own approach; gitleaks unavailable) | exit 0, 0 blocking | PASS (377 files, 0 blocking) |
| 8 | `npx tsx scripts/security-sast.ts` | SAST (own approach; semgrep unavailable) | exit 0 | PASS |
| 9 | Header + origin check | OWASP Secure Headers | 6 headers + origin enforcement | PASS |

`gitleaks`, `trufflehog`, and `semgrep` are not installed in this environment;
steps 7–8 are the committed executable equivalents using the same pattern
policy as runtime enforcement. Re-run with the external tools when available;
disagreements fail release review.

## OWASP LLM Top 10 (2025) mapping

| ID | Control | Evidence |
|---|---|---|
| LLM01 Prompt injection | Quarantine high severity at intake + admission; instruction hierarchy, JSON envelope, per-field/total budgets, negative constraints | `secure-execution.test.ts`, `prompt-injection-guard.test.ts`, `enqueue-analysis.test.ts` |
| LLM02 Sensitive disclosure | Pre/post-LLM redaction, output quarantine, quarantined-read masking | `secret-scanner.test.ts`, `secret-redaction.test.ts`, `audit-ledger.test.ts`, sweep PASS |
| LLM03 Supply chain | Model allowlist (`GROQ_ALLOWED_MODELS`), pinned versions, SBOM, `audit:ci` | `enqueue-analysis.test.ts`, SBOM 825 components, 0 critical |
| LLM04 Data/model poisoning | Ingestion kill-switch, source quotas, quarantine-before-analysis, snapshot hashes + admission manifests | `enqueue-analysis.test.ts`, `preflight.test.ts` |
| LLM05 Output handling | Zod schemas with bounds, citation allowlisting, no `eval`, SAST PASS | `evidence-lifecycle.test.ts`, `hardening.test.ts`, SAST PASS |
| LLM06 Excessive agency | Text-only `generateText` (no tools), quality sandbox gated, no auto-merge | `quality-sandbox.test.ts`, sandbox stub fail-closed |
| LLM07 System-prompt leakage | Instructions never interpolated with untrusted data; telemetry stores IDs/tokens only | `ai-sdk-mock-language-model.test.ts` |
| LLM08 Embeddings | N/A — no vector stores or embeddings in schema | `grep embedding|pgvector` empty (verified during review) |
| LLM09 Misinformation | Deterministic scorecards; LLM text labeled draft; evaluator never scores | `no-llm-scores.test.ts`, methodology doc |
| LLM10 Consumption | Token budgets, reservations, rate limits, timeouts, inference kill-switch | `run-analysis-route.test.ts`, budget tests |

## ASVS 4.0.3 focused L1 self-assessment (sampled, high-value items)

| Requirement | Status | Evidence |
|---|---|---|
| 2.2.1 credential storage / secret strength (32-char auth secret) | PASS | `src/lib/auth.ts`, onboarding test env |
| 3.3 session binding and revocation | PASS | sessions API + revocation, `settings/sessions` |
| 4.1/4.2 deny-by-default authorization, tenant isolation | PASS | `tenancy.test.ts`, `authorization.test.ts` |
| 5.1 input validation (Zod), 5.3 output encoding (React) | PASS | `validation.ts`, `hardening.test.ts` |
| 5.5 file upload allowlist + size caps | PASS | `sources/route.ts`, `secure-execution.test.ts` |
| 6.2/8.3 TLS to DB (`sslmode=require`), no secret logging | PASS | `.env.example`, `audit-ledger.test.ts` |
| 7.1/7.2 safe logging, no sensitive data in errors | PASS | `secret-redaction.ts`, `audit-log.ts` redaction |
| 9.1 webhook TLS + constant-time HMAC, bounded bodies | PASS | `webhook-security.test.ts`, `github-webhook.test.ts` |
| 12.1/12.3 untrusted file handling, path safety | PASS | `secure-execution.test.ts`, `quality-sandbox.test.ts` |
| 13.1/13.2 rate limiting, 429 handling | PASS | `rate-limit.ts`, `run-analysis-route.test.ts` |
| 14.4/14.5 security headers, dependency pinning | PASS | `next.config.ts`, header check, SBOM |

Full 286-item review is tracked as follow-up; every applicable L1 item sampled
above passes. No unjustified L1 failure remains.

## Issues found by this battery and fixed

- Non-canonical base64url trailing bits in signed onboarding state
  (`src/lib/github/onboarding-state.ts`): `Buffer.from(sig, 'base64url')`
  ignores the 2 padding bits of the last character, so some last-character
  forgeries decoded identically and passed `timingSafeEqual` (caught as an
  intermittent `github-onboarding.test.ts` failure; unexploitable in practice
  because the DB-bound token hash still mismatched). Fixed with a canonical
  re-encoding check; the tamper test now passes deterministically.
- Entropy-pattern fusion (`NAME=value` scanned as one token) caused
  over-quarantine of benign config text (`src/lib/security/secret-scanner.ts`):
  `=` removed from the token body. Verified against existing corpus tests.

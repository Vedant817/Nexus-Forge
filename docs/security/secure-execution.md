# Secure execution over untrusted inputs

Nexus Forge runs analysis over attacker-controlled content: pasted/uploaded
documents, public or private GitHub repositories, and PR text. Repository code
is **never executed** — collection reads Git blobs as text through the GitHub
REST API. The Docker boundary exists only around patch-proposal checks on our
own checkout (`src/lib/quality/sandbox.ts`), never around user repositories.

## Threat model

| Threat | Control | Evidence |
|---|---|---|
| Prompt injection in sources/repos/PRs steering model output | Quarantine on high severity at intake (`sources/route.ts`) and re-scan at admission (`enqueue-analysis.ts`); instruction hierarchy + JSON envelope + per-field/total budgets (`ai-runner.ts` `boundUntrustedInput`); negative output constraints | `secure-execution.test.ts`, `prompt-injection-guard.test.ts` |
| Credential exfiltration via model or logs | Pattern-synced scanner + redaction (`secret-scanner.ts`, `secret-redaction.ts`); pre/post-LLM redaction; output quarantine; quarantined rows masked on read | `secret-scanner.test.ts`, `secret-redaction.test.ts`, `audit-ledger.test.ts` |
| Path traversal / symlink escape in tree entries | Normalizing `safePath` (256-char cap, control-char rejection), symlink-as-metadata policy, sandbox `realpath` containment | `secure-execution.test.ts`, `quality-sandbox.test.ts` |
| Malicious filenames rendered or persisted | Server-side filename allowlist, control-char rejection, 20k-line cap | `secure-execution.test.ts` |
| Oversized content starving workers/LLM budgets | 1 MiB/file, 25 MiB/repo, 5-way blob concurrency, 120 s snapshot deadline, 8 KiB/string + 100 KiB model-input budgets, 2k-path tree cap | `secure-execution.test.ts` |
| Binary blobs polluting text pipelines | Null-byte + non-UTF8 ratio detection → `binary` status, never collected | `secure-execution.test.ts` |
| Poisoned edits becoming executed code | Sandbox forbids `package.json`/lockfiles/Dockerfiles/`.husky`/`scripts/`/`*.config.*`; npm runs with `--ignore-scripts` as uid 65534, `--network=none`, `--cap-drop=ALL` | `quality-sandbox.test.ts`, `secure-execution.test.ts` |
| Installation-token leakage into prompts | Tokens exist only in `Authorization` headers; redaction covers `ghs_`/`ghu_` shapes; bounded inputs asserted token-free | `secure-execution.test.ts` |

## Residual risks (honest)

- Secret scanning is pattern + entropy based; novel exfiltration shapes can pass. Mitigation: quarantine-by-default posture, audited overrides with expiry, output re-scan.
- `Source.rawContent` persists server-side until project deletion; quarantined rows are masked on read and blocked from runs, and deletion purges all stores (`docs/operations/retained-field-inventory.md`).
- The `scripts/sandbox-worker.ts` stub is fail-closed in production; real verification goes through `runQualitySandbox`.
- Non-English prompt injection has no regex coverage; the instruction-hierarchy envelope and output allowlisting are the controls.
- Single-pattern (below-high) injection is flagged, not quarantined; deliberate dilution is possible but must still defeat the envelope instructions and output validation.
- Chunked credentials split for entropy evasion (not structured shapes) are not joined across lines.
- Near-miss sandbox paths (`scripts_evil/`, `package.json.bak`) are allowed but inert: npm runs with `--ignore-scripts` and only allowlisted commands execute.

## Red-team record (2026-09-23)

An independent adversarial review produced 22 attack cases (`src/__tests__/secure-execution.test.ts`
encodes the battery). Findings fixed: audited overrides clobbered by admission
re-scan (now honored when valid, re-quarantine on content change); UTF-8 text
falsely detected as binary (now decode-aware); split-token concatenation,
Stripe test keys, and Slack tokens not blocking (now high severity);
structured tokens split across lines missed (now cross-line matched);
unbounded nesting depth in model inputs (now capped at 10); file-level
high-severity injection reaching the model (now quarantined); base64 and
whitespace-collapsed smuggling (now detected); base64url canonical-encoding
forgery in onboarding state (now rejected). Non-issues confirmed by test:
SSRF via PR full names (strict URL parsing + DB binding cross-check),
symlink content fetch (recorded, never followed), envelope forgery/replay
(HMAC + digest binding).

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

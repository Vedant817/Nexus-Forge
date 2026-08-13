# Quality sandbox

The web quality orchestrator is proposal-only and never modifies the live checkout. Deterministic build/test/lint/typecheck decisions may be produced only by `npm run quality:sandbox -- edits.json output.patch`.

The command creates a detached disposable Git worktree, applies bounded exact-match edits there, and runs allowlisted commands inside a Docker image pinned by `QUALITY_SANDBOX_IMAGE` to a SHA-256 digest. The container has no network, a read-only root filesystem, no Linux capabilities, `no-new-privileges`, non-root UID/GID, CPU/memory/PID limits, bounded output and time, a read-only dependency mount, and no application secrets. It emits a patch for human review and removes the worktree.

This is not a general-purpose remote execution service. Docker remains a privileged host dependency and must run on a dedicated worker, not a shared web host. Do not mount the Docker socket into the sandbox container. Keep the image minimal, scan its digest, and rotate it through review. Unsupported commands remain `UNKNOWN`; the LLM does not decide pass/fail.

## Verified local recipe

The end-to-end path was verified on 2026-08-13 with Docker 29.7.2 and the official Node 22 Bookworm Slim image pinned to the digest below:

```bash
docker pull node:22-bookworm-slim
export QUALITY_SANDBOX_IMAGE='node@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436'
npm run quality:sandbox -- edits.json quality-review.patch
```

The fixture made one exact-match README edit and requested `typecheck`. The sandbox returned `PASS`, exit code `0`, emitted a non-empty review patch, and removed its `nexus-forge-quality-*` worktree. Revalidate and review the image digest before using it on a dedicated worker; a locally verified public image is not a substitute for an organizational image admission policy.

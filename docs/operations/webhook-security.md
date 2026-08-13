# GitHub webhook security

## Trust model

The webhook endpoint is a system-to-system ingress, not a browser action. It therefore does not require a user session. Authentication comes from GitHub's `X-Hub-Signature-256` HMAC over the exact raw request bytes using `GITHUB_WEBHOOK_SECRET`. A valid signature proves possession of the shared webhook secret; it does not grant user-level access to arbitrary projects.

After authentication, pull-request deliveries are matched to a project by the numeric GitHub App installation and repository IDs already bound to that project. Installation lifecycle deliveries update only projects associated with the authenticated installation ID.

## Request flow

1. Reject missing or malformed `X-Hub-Signature-256` and `X-GitHub-Delivery` headers.
2. Accept only supported `X-GitHub-Event` values.
3. Read the raw request body up to `WEBHOOK_MAX_BODY_BYTES` (1,000,000 bytes by default). A declared or streamed body over the cap receives `413`.
4. Compute `HMAC-SHA256(GITHUB_WEBHOOK_SECRET, rawBody)` and compare it to the supplied hexadecimal digest with `timingSafeEqual`.
5. Parse and schema-check JSON only after signature verification.
6. Hash the authenticated payload and persist a redacted representation.
7. Insert the delivery under the unique GitHub delivery ID. A repeated delivery returns `202` with `replay: true` and does not enqueue duplicate work.
8. Queue eligible merged-pull-request work for the durable worker; do not run the analysis inside the webhook request.

The signature must cover the bytes exactly as received. Parsing and re-serializing JSON before verification would change byte representation and invalidate the trust boundary.

## Rehearsal request

This deterministic example uses the development-only secret `development-webhook-secret`. Never use that value outside local testing.

```bash
export GITHUB_WEBHOOK_SECRET='development-webhook-secret'
PAYLOAD='{"action":"opened","installation":{"id":1},"repository":{"id":2,"full_name":"octo/example"},"pull_request":{"id":3,"number":4,"title":"Example","body":null,"merged":false}}'

curl --fail-with-body -i http://localhost:3000/api/webhooks/github \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: pull_request' \
  -H 'X-GitHub-Delivery: rehearsal-0001' \
  -H 'X-Hub-Signature-256: sha256=07dd26604f858735effe2d87fdbeec960b9ebea22678999e7cc55c140a97ece1' \
  --data-binary "$PAYLOAD"
```

The signature above is valid only for the exact payload and secret shown. Because the example repository is normally not registered, a correctly configured local server should pass HMAC verification and then return `404 Repository installation is not registered`. A `401 Invalid webhook signature` indicates that the payload bytes, signature, or configured secret differ.

Generate a signature for another local fixture without printing the real secret:

```bash
SIGNATURE="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" -binary | xxd -p -c 256)"
```

## Operations

- Store `GITHUB_WEBHOOK_SECRET` in the deployment secret manager and rotate it in GitHub App settings and the deployment together.
- Keep `WEBHOOK_MAX_BODY_BYTES` a positive safe integer; invalid configuration fails closed with `503`.
- Monitor `401`, `413`, replay, and queue failure rates without logging raw bodies or signature headers.
- Delivery deduplication is database-backed. Retention or archival work must preserve the uniqueness needed for the chosen replay window.

# GitHub App collection operations

## Required App configuration

Configure a GitHub App with a webhook secret and read-only **Contents**, **Pull requests**, and **Checks** repository permissions. Subscribe to `pull_request`, `installation`, and `installation_repositories` events. Set the Setup URL to `<BETTER_AUTH_URL>/api/github/app/setup`. `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` must be this same App's user-authorization credentials; Nexus Forge verifies the client ID through `GET /app`. Set `GITHUB_APP_ID`, one private-key environment variable, `GITHUB_WEBHOOK_SECRET`, and the pinned REST API version.

Shared personal access tokens are rejected. App JWTs use RS256 and expire within ten minutes. Installation tokens are restricted to the bound numeric repository ID and requested read permissions, expire within one hour, and are cached only as a process optimization.

## Binding repositories

A signed-in project owner starts with same-origin `POST /api/projects/:id/github-binding/start`. Nexus Forge creates a 15-minute HMAC-signed, database-backed state bound to the exact session, user, and project, then sends the user to the verified App slug returned by GitHub. The HttpOnly `SameSite=Lax` state cookie is the callback correlation boundary; the setup callback never trusts query parameters alone.

The callback treats `installation_id` as an untrusted candidate. It cross-checks the signed-in GitHub identity, the user's installation list, App-JWT installation metadata, App/client identity, account identity, suspension state, and required permissions. Final `POST /api/projects/:id/github-binding` accepts only a repository ID from the verified flow, requires GitHub repository administrator permission, mints a fresh repository-scoped installation token, and stores canonical repository and permission metadata while consuming the state exactly once. `DELETE` disconnects it and invalidates pending flows.

GitHub organization policy still decides who may install or approve an App. A pending installation request fails closed until GitHub reports approved authority. Protect the Better Auth account table as credential material; OAuth-token encryption is deferred until legacy GitHub token migration can be performed without misclassifying hexadecimal tokens.

## Snapshot guarantees and bounds

The worker resolves a branch once, stores the 40-character commit SHA, resolves the Git commit's tree, and uses only tree/blob SHAs afterward. A truncated recursive tree triggers non-recursive subtree traversal. Collection is bounded to 50,000 entries, 5,000 supported text/source files, 1 MiB per decoded file, and 25 MiB total decoded text. Symlinks, submodules, oversize files, unavailable blobs, and reached bounds are stored as statuses/diagnostics.

PR files and reviews follow GitHub `Link` pagination at 100 items per page. PR files are capped by GitHub at 3,000. Checks are traversed through commit suites and suite runs with `filter=all`; GitHub's recent-suite limits remain explicit. Missing or incomplete signals yield `UNKNOWN`, never an assumed pass.

## Lifecycle and incidents

Webhook HMAC is verified over bounded raw bytes before parsing. Installation deletion/suspension and repository removal disable matching bindings. Unsuspend, repository addition, and permission changes move bindings to `reconciliation_required`; they never reactivate access blindly. Every lifecycle event is durably recorded and serialized against final activation, invalidates local installation-token caches, and prevents inactive bindings from receiving pull-request work. Workers re-check current binding identity/status before and after GitHub collection so a queued snapshot is not treated as a continuing authorization grant. Delivery IDs are immutable and idempotent. The migration quarantines bindings created by the legacy client-supplied flow as `reconciliation_required`.

Private repositories default to deterministic-only processing. External inference requires explicit project authorization with residual-risk acknowledgement, recorded in the immutable run admission manifest. Deterministic evidence is sealed before optional generation, so model failure cannot erase the baseline. Repository collection excludes high-risk credential paths and quarantines suspected secrets; model output containing suspected credentials is blocked. Ingestion and inference have global kill switches plus project-level suspension. Secret scanning reduces risk but cannot guarantee complete detection or removal.

Rate-limit responses honor `Retry-After` or reset time with bounded backoff. External GitHub GETs remain at-least-once after a worker crash, while snapshot persistence and downstream publication are database-fenced and immutable.

# GitHub App collection operations

## Required App configuration

Configure a GitHub App with a webhook secret and read-only **Contents**, **Pull requests**, and **Checks** repository permissions. Subscribe to `pull_request`, `installation`, and `installation_repositories` events. Set `GITHUB_APP_ID`, one private-key environment variable, `GITHUB_WEBHOOK_SECRET`, and the pinned REST API version.

Shared personal access tokens are rejected. App JWTs use RS256 and expire within ten minutes. Installation tokens are restricted to the bound numeric repository ID and requested read permissions, expire within one hour, and are cached only as a process optimization.

## Binding repositories

A signed-in project owner sends a same-origin `POST /api/projects/:id/github-binding` containing the numeric installation ID, numeric repository ID, and full name selected after installing the App. Nexus Forge does not trust these values alone: it creates a repository-scoped installation token and verifies the repository identity through GitHub before storing the binding. `DELETE` disconnects it.

GitHub organization policy decides who may install or approve an App. Operators should direct users through GitHub's installation UI before reconciliation. Do not add a callback that trusts `installation_id` from a query string.

## Snapshot guarantees and bounds

The worker resolves a branch once, stores the 40-character commit SHA, resolves the Git commit's tree, and uses only tree/blob SHAs afterward. A truncated recursive tree triggers non-recursive subtree traversal. Collection is bounded to 50,000 entries, 5,000 supported text/source files, 1 MiB per decoded file, and 25 MiB total decoded text. Symlinks, submodules, oversize files, unavailable blobs, and reached bounds are stored as statuses/diagnostics.

PR files and reviews follow GitHub `Link` pagination at 100 items per page. PR files are capped by GitHub at 3,000. Checks are traversed through commit suites and suite runs with `filter=all`; GitHub's recent-suite limits remain explicit. Missing or incomplete signals yield `UNKNOWN`, never an assumed pass.

## Lifecycle and incidents

Webhook HMAC is verified over bounded raw bytes before parsing. Installation deletion/suspension and repository removal disable matching bindings; suspension/deletion invalidates cached installation tokens. Delivery IDs are immutable and idempotent. Reconcile bindings after `unsuspend` and permission changes.

Rate-limit responses honor `Retry-After` or reset time with bounded backoff. External GitHub GETs remain at-least-once after a worker crash, while snapshot persistence and downstream publication are database-fenced and immutable.

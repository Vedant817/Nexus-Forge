# Authentication and project-owner migration

The `20260811174500_auth_ownership_controls` migration intentionally adds `Project.ownerId` as nullable for a safe two-step rollout. Unowned legacy projects are inaccessible through authenticated routes; new projects always receive the current session user as owner.

## Rollout

1. Configure `BETTER_AUTH_URL`, a strong `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`.
2. Apply migrations with `npx prisma migrate deploy`.
3. Sign in once with the GitHub account that should own legacy projects.
4. Set `LEGACY_PROJECT_OWNER_EMAIL` to that Better Auth user email.
5. Run `npm run backfill:project-owners` and verify it reports the expected count.
6. Confirm `SELECT COUNT(*) FROM "Project" WHERE "ownerId" IS NULL;` returns zero.
7. In a later migration, make `Project.ownerId` non-null after every environment is backfilled.

Do not temporarily expose unowned projects or infer ownership from request-supplied identifiers. Until the backfill completes, legacy rows fail closed with a non-enumerating 404.

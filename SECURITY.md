# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's **Security** tab using a private vulnerability report. Do not open a public issue containing exploit details, private repository data, credentials, or customer information.

Include the affected commit/version, impact, reproduction steps, and any suggested mitigation. The maintainers will acknowledge a credible report within two business days and coordinate disclosure after a fix or mitigation is available.

## Dependency response targets

Nexus Forge uses these remediation targets from the time a relevant advisory is confirmed:

| Severity | Target |
|---|---:|
| Critical and actively exploited | 24 hours |
| Critical | 72 hours |
| High | 14 days |
| Moderate/low | Next planned dependency maintenance cycle |

CI blocks known critical runtime advisories and publishes a CycloneDX SBOM for every verified commit. High findings must be fixed within the target or recorded below with reachability evidence, compensating controls, an owner, and an expiration date. Expired exceptions fail release review until renewed or resolved.

## Current temporary exceptions

- Review owner: repository maintainers
- Review expires: 2026-10-06

| Advisory | Transitive path | Reachability and compensating control |
|---|---|---|
| `GHSA-ggr8-5vv4-36mx` (`deepmerge-ts`) | Prisma CLI configuration | The affected merge helper is in the development-time Prisma CLI path. Production uses the generated Prisma client and does not accept untrusted Prisma configuration objects. CI does not run against untrusted pull-request configuration with production credentials. |
| `GHSA-3f6p-5ww8-9rcr` and `GHSA-rgwj-5xj2-c3m3` (`mysql2`) | Prisma tooling and Better Auth's optional database support | Nexus Forge configures Better Auth with the Prisma PostgreSQL adapter and the application database layer uses PostgreSQL adapters only. No MySQL connection, MySQL URL, or MySQL authentication plugin is exposed. |

There is no compatible fixed release reported by `npm audit` for these paths at the time of review. `npm audit fix --force` proposes Prisma 6.19.3, which is an unsafe major downgrade from Prisma 7 and is not an acceptable remediation. Recheck upstream releases before the expiration date and remove each exception as soon as a compatible fix exists.

## Release evidence

Before release:

1. Run `npm run audit:ci`.
2. Generate the SBOM with `npm run sbom`.
3. Review any high finding against this file and its expiration date.
4. Run build, typecheck, lint, unit tests, and PostgreSQL integration tests.
5. Attach the CI result and SBOM to the release record.

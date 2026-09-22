# Enterprise SSO and lifecycle (P6)

SAML/OIDC SSO is configured at the identity provider with domain verification
(`VerifiedDomain` + DNS TXT token). SCIM provisions memberships and group
mappings; deprovisioning removes memberships. Enforced MFA is an identity-provider
requirement for OWNER/ADMIN roles; approval-gated actions additionally require
separation of duties. Custom roles layer on workspace roles without granting
platform-denied actions.

Environment: SSO_ISSUER, SSO_CLIENT_ID, SSO_CLIENT_SECRET, SCIM_TOKEN.
Data residency follows DATA_REGION. Provider routing uses the model allowlist
with per-organization disablement. Customer-managed keys are referenced via
`CustomerManagedKey`; tenant-key destruction remains the erasure path.
SOC 2 Type II is deferred until controls have sufficient operating history.
Annual penetration testing and the bug-bounty program are tracked in
`docs/legal/disclosure.md`.

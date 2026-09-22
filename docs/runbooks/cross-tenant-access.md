# Runbook: suspected cross-tenant access

1. Preserve audit logs; do not delete evidence.
2. Suspend affected workspaces (ingestion + inference suspension).
3. Verify tenant role checks on every API, job, export, and billing object.
4. Notify affected customers with scope and remediation; record support access.

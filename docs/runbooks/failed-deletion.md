# Runbook: failed deletion and restore

1. Inspect DeletionRequest status; retry purge for IN_PROGRESS items older than 1 hour.
2. Verify absence across every active store before marking COMPLETED.
3. Never restore backups for tombstoned tenants.
4. Record completion with keyed tombstone only.

# Runbook: GitHub App compromise

1. Rotate the GitHub App private key and webhook secret; update secrets references.
2. Set INGESTION_DISABLED=true to stop new collection; lifecycle events still processed.
3. Invalidate installation token caches and reconcile bindings to `reconciliation_required`.
4. Review audit logs for unexpected bindings; disconnect affected installations.
5. Re-enable ingestion only after verification.

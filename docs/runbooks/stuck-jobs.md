# Runbook: stuck jobs and webhook outage

1. Check `/api/metrics` queue depth and age.
2. Inspect worker leases and heartbeats; expired leases are reaped automatically.
3. Check webhook deliveries for replay or signature failures.
4. Scale workers within capacity controls; do not duplicate sealed ledgers.

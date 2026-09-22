# Alerts (pilot)

Metrics source: `GET /api/metrics` (counts only, no payloads).

- Queue depth &gt; 50 for 10 minutes (webhook outage, stuck jobs).
- Oldest queued job age &gt; 15 minutes.
- Dead-letter jobs &gt; 0 (failures, retries exhausted).
- Retry-wait growth over 30 minutes.
- Webhook 5xx rate elevated.
- GitHub rate-limit responses increasing.
- Model errors (AI_PROVIDER_*, AI_OUTPUT_*) increasing.
- Budget anomalies: daily usage &gt; 80% of quota.
- Billing drift: entitlement usage vs recorded usage mismatch.
- Deletion requests stuck IN_PROGRESS &gt; 1 hour.

All alerts reference request/job IDs only and never include prompts, code, diffs,
or secrets.

# Runbook: model provider incident

1. Set INFERENCE_DISABLED=true; deterministic baselines continue.
2. Monitor `/api/metrics` for model error spikes and budget anomalies.
3. Optional inference failures preserve sealed baselines; no baseline is unsealed.
4. Re-enable only after provider health is confirmed.

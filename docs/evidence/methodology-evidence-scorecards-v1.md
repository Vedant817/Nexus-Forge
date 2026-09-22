# Methodology: evidence-scorecards-v1

Versioned evidence summary, not a calibrated prediction of quality, security,
compliance, or release success. Scores are weighted rollups of observed
deterministic criteria with completeness and PASS/FAIL/UNKNOWN/NOT_APPLICABLE
counts. Unknowns are not failures.

Accepted baseline means a human-maintained workflow state, not proof that a
repository is defect-free. Accepted clean result means, for the published policy
version only: no unresolved policy-blocking FAIL and no required UNKNOWN.
Organization policy thresholds are reported separately and never modify the
canonical scorecard.

Limitations: collectors observe a bounded subset (file caps, API caps); missing
access yields UNKNOWN; model-generated explanations are review-required drafts.
Evaluation: fixed fixtures in `evals/scorecards/v1` with expert labels from two
independent reviewers; disagreements published; precision/recall and
version-regression suite must pass before any readiness claim ships.

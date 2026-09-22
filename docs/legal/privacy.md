# Privacy policy (pilot)

Nexus Forge processes repository and source content only within the workspace that
connected it. Private repositories default to deterministic-only processing.
External model inference requires explicit workspace authorization with
residual-risk acknowledgement, recorded in the run admission manifest.

Deterministic evidence (file inventory, scorecards, dependency maps) is sealed
before optional generation. Secret scanning reduces risk but cannot guarantee
complete detection or removal. Disconnect stops new collection immediately;
active-system deletion purges primary and derived stores, with backup expiry per
the hosting schedule and only minimal legal records retained.

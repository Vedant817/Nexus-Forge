-- Seed curated run templates. GET /api/templates is read-only; template
-- version lifecycle moves through new migrations, never request-time writes.
INSERT INTO "RunTemplate" ("id", "name", "description", "controls", "version", "active", "createdAt", "updatedAt")
VALUES
  ('tmpl_web_app_v1', 'web-app', 'Web application review with standard depth.', '{"maxSources":10,"maxContentLength":50000,"maxFiles":1500,"includePRChecks":true,"verbosity":"standard"}', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tmpl_api_service_v1', 'api-service', 'API service review with strict checks.', '{"maxSources":20,"maxContentLength":100000,"maxFiles":5000,"includePRChecks":true,"verbosity":"detailed"}', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tmpl_quick_triage_v1', 'quick-triage', 'Fast triage with minimal collection.', '{"maxSources":5,"maxContentLength":20000,"maxFiles":500,"includePRChecks":false,"verbosity":"concise"}', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

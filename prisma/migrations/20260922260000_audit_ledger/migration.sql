ALTER TABLE "AuditLog"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "interface" TEXT NOT NULL DEFAULT 'api',
  ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'success';

CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

CREATE FUNCTION "prevent_audit_ledger_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit ledger is append-only';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_immutable_update" BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "prevent_audit_ledger_update"();

-- Repository-bound GitHub App snapshots pinned to immutable commit SHAs.
ALTER TABLE "Project"
  ADD COLUMN "githubBindingStatus" TEXT NOT NULL DEFAULT 'unbound',
  ADD COLUMN "githubBindingDisabledAt" TIMESTAMP(3);

CREATE TABLE "GitHubLifecycleDelivery" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubLifecycleDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GitHubLifecycleDelivery_deliveryId_key" ON "GitHubLifecycleDelivery"("deliveryId");
CREATE INDEX "GitHubLifecycleDelivery_installationId_receivedAt_idx" ON "GitHubLifecycleDelivery"("installationId","receivedAt");

CREATE TABLE "RepositorySnapshot" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "analysisRunId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "repositoryFullName" TEXT NOT NULL,
  "commitSha" TEXT NOT NULL,
  "treeSha" TEXT NOT NULL,
  "collectorVersion" TEXT NOT NULL,
  "complete" BOOLEAN NOT NULL DEFAULT false,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "diagnostics" JSONB NOT NULL,
  "entryCount" INTEGER NOT NULL DEFAULT 0,
  "sourceFileCount" INTEGER NOT NULL DEFAULT 0,
  "decodedBytes" INTEGER NOT NULL DEFAULT 0,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositorySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepositoryFile" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "blobSha" TEXT,
  "size" INTEGER,
  "status" TEXT NOT NULL,
  "language" TEXT,
  "content" TEXT,
  "contentHash" TEXT,
  "diagnostic" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositorySnapshot_analysisRunId_key" ON "RepositorySnapshot"("analysisRunId");
CREATE UNIQUE INDEX "RepositorySnapshot_projectId_repositoryId_commitSha_collectorVersion_key" ON "RepositorySnapshot"("projectId","repositoryId","commitSha","collectorVersion");
CREATE INDEX "RepositorySnapshot_projectId_createdAt_idx" ON "RepositorySnapshot"("projectId","createdAt");
CREATE UNIQUE INDEX "RepositoryFile_snapshotId_path_key" ON "RepositoryFile"("snapshotId","path");
CREATE INDEX "RepositoryFile_snapshotId_status_idx" ON "RepositoryFile"("snapshotId","status");

ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_analysisRunId_fkey"
  FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepositoryFile" ADD CONSTRAINT "RepositoryFile_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "RepositorySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_commit_sha_check"
  CHECK ("commitSha" ~ '^[0-9a-f]{40}$' AND "treeSha" ~ '^[0-9a-f]{40}$');
ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_bounds_check"
  CHECK ("entryCount" BETWEEN 0 AND 50000 AND "sourceFileCount" BETWEEN 0 AND 5000 AND "decodedBytes" BETWEEN 0 AND 26214400);

CREATE TRIGGER "GitHubLifecycleDelivery_immutable" BEFORE UPDATE OR DELETE ON "GitHubLifecycleDelivery"
  FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();

CREATE FUNCTION "validate_repository_snapshot_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AnalysisRun" run JOIN "Project" project ON project."id" = run."projectId"
    WHERE run."id" = NEW."analysisRunId" AND run."projectId" = NEW."projectId"
      AND project."githubInstallationId" = NEW."installationId"
      AND project."githubRepositoryId" = NEW."repositoryId"
      AND project."githubBindingStatus" = 'active'
  ) THEN RAISE EXCEPTION 'Repository snapshot tenant or GitHub binding mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RepositorySnapshot_validate_scope" BEFORE INSERT ON "RepositorySnapshot"
  FOR EACH ROW EXECUTE FUNCTION "validate_repository_snapshot_scope"();
CREATE FUNCTION "validate_repository_file_insert"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "RepositorySnapshot" snapshot JOIN "AnalysisRun" run ON run."id" = snapshot."analysisRunId"
    WHERE snapshot."id" = NEW."snapshotId" AND run."status" IN ('QUEUED','RUNNING')
  ) THEN RAISE EXCEPTION 'Repository snapshot is sealed or terminal'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RepositoryFile_open_insert" BEFORE INSERT ON "RepositoryFile"
  FOR EACH ROW EXECUTE FUNCTION "validate_repository_file_insert"();
CREATE TRIGGER "RepositorySnapshot_immutable_update" BEFORE UPDATE OR DELETE ON "RepositorySnapshot"
  FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "RepositoryFile_immutable_update" BEFORE UPDATE OR DELETE ON "RepositoryFile"
  FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();

-- Deterministic evidence ledger and versioned scorecards.
CREATE TYPE "ScorecardKind" AS ENUM ('REPOSITORY_MATURITY', 'RELEASE_READINESS', 'PROOF_COMPLETENESS');
CREATE TYPE "CriterionStatus" AS ENUM ('PASS', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE');
CREATE TYPE "EvidenceConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "EvidenceProvenance" AS ENUM ('SOURCE_SNAPSHOT', 'REPOSITORY_SNAPSHOT', 'PULL_REQUEST_SNAPSHOT', 'GENERATED_ARTIFACT', 'WEBHOOK_PAYLOAD');

ALTER TABLE "RepoAnalysis"
  ADD COLUMN "scoreCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "scoreStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "scorecardVersion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReleaseReport"
  ADD COLUMN "scoreCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "scoreStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "scorecardVersion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProofPack"
  ADD COLUMN "scoreCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "scoreStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "scorecardVersion" TEXT NOT NULL DEFAULT '';

CREATE TABLE "EvidenceRecord" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "analysisRunId" TEXT NOT NULL,
  "analysisStageRunId" TEXT,
  "stableEvidenceId" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "collectorId" TEXT NOT NULL,
  "collectorVersion" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "repositoryFullName" TEXT,
  "commitSha" TEXT,
  "path" TEXT,
  "lineStart" INTEGER,
  "lineEnd" INTEGER,
  "checkId" TEXT,
  "contentHash" TEXT NOT NULL,
  "facts" JSONB NOT NULL,
  "provenance" "EvidenceProvenance" NOT NULL,
  "confidence" "EvidenceConfidence" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EvidenceRecord_line_span_check" CHECK (
    ("lineStart" IS NULL AND "lineEnd" IS NULL) OR
    ("lineStart" IS NOT NULL AND "lineEnd" IS NOT NULL AND "lineStart" > 0 AND "lineEnd" >= "lineStart")
  )
);

CREATE TABLE "Scorecard" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "analysisRunId" TEXT NOT NULL,
  "kind" "ScorecardKind" NOT NULL,
  "version" TEXT NOT NULL,
  "score" INTEGER,
  "completenessRatio" DOUBLE PRECISION NOT NULL,
  "applicableCount" INTEGER NOT NULL,
  "evaluatedCount" INTEGER NOT NULL,
  "passCount" INTEGER NOT NULL,
  "failCount" INTEGER NOT NULL,
  "unknownCount" INTEGER NOT NULL,
  "notApplicableCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Scorecard_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "Scorecard_completeness_check" CHECK ("completenessRatio" >= 0 AND "completenessRatio" <= 1),
  CONSTRAINT "Scorecard_counts_check" CHECK (
    "applicableCount" >= 0 AND "evaluatedCount" >= 0 AND "passCount" >= 0 AND "failCount" >= 0 AND "unknownCount" >= 0 AND "notApplicableCount" >= 0
  )
);

CREATE TABLE "CriterionResult" (
  "id" TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "criterionVersion" TEXT NOT NULL,
  "status" "CriterionStatus" NOT NULL,
  "weight" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CriterionResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CriterionResult_weight_check" CHECK ("weight" > 0)
);

CREATE TABLE "CriterionResultEvidence" (
  "criterionResultId" TEXT NOT NULL,
  "evidenceRecordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CriterionResultEvidence_pkey" PRIMARY KEY ("criterionResultId", "evidenceRecordId")
);

CREATE UNIQUE INDEX "EvidenceRecord_analysisRunId_stableEvidenceId_key" ON "EvidenceRecord"("analysisRunId", "stableEvidenceId");
CREATE INDEX "EvidenceRecord_projectId_analysisRunId_evidenceType_idx" ON "EvidenceRecord"("projectId", "analysisRunId", "evidenceType");
CREATE INDEX "EvidenceRecord_contentHash_idx" ON "EvidenceRecord"("contentHash");
CREATE UNIQUE INDEX "Scorecard_analysisRunId_kind_version_key" ON "Scorecard"("analysisRunId", "kind", "version");
CREATE INDEX "Scorecard_projectId_kind_createdAt_idx" ON "Scorecard"("projectId", "kind", "createdAt");
CREATE UNIQUE INDEX "CriterionResult_scorecardId_criterionId_criterionVersion_key" ON "CriterionResult"("scorecardId", "criterionId", "criterionVersion");
CREATE INDEX "CriterionResult_scorecardId_status_idx" ON "CriterionResult"("scorecardId", "status");
CREATE INDEX "CriterionResultEvidence_evidenceRecordId_idx" ON "CriterionResultEvidence"("evidenceRecordId");

ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_analysisStageRunId_fkey" FOREIGN KEY ("analysisStageRunId") REFERENCES "AnalysisStageRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriterionResultEvidence" ADD CONSTRAINT "CriterionResultEvidence_criterionResultId_fkey" FOREIGN KEY ("criterionResultId") REFERENCES "CriterionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CriterionResultEvidence" ADD CONSTRAINT "CriterionResultEvidence_evidenceRecordId_fkey" FOREIGN KEY ("evidenceRecordId") REFERENCES "EvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_evidence_ledger_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Evidence ledger rows are immutable; create a new analysis run and version instead';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "validate_evidence_record_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AnalysisRun" WHERE "id" = NEW."analysisRunId" AND "projectId" = NEW."projectId") THEN
    RAISE EXCEPTION 'EvidenceRecord project/run scope mismatch';
  END IF;
  IF NEW."analysisStageRunId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AnalysisStageRun" WHERE "id" = NEW."analysisStageRunId" AND "analysisRunId" = NEW."analysisRunId"
  ) THEN
    RAISE EXCEPTION 'EvidenceRecord stage/run scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "validate_scorecard_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AnalysisRun" WHERE "id" = NEW."analysisRunId" AND "projectId" = NEW."projectId") THEN
    RAISE EXCEPTION 'Scorecard project/run scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "validate_criterion_evidence_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "CriterionResult" AS result
    JOIN "Scorecard" AS scorecard ON scorecard."id" = result."scorecardId"
    JOIN "EvidenceRecord" AS evidence ON evidence."id" = NEW."evidenceRecordId"
    WHERE result."id" = NEW."criterionResultId"
      AND evidence."analysisRunId" = scorecard."analysisRunId"
      AND evidence."projectId" = scorecard."projectId"
  ) THEN
    RAISE EXCEPTION 'CriterionResultEvidence scorecard/evidence scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EvidenceRecord_validate_scope" BEFORE INSERT ON "EvidenceRecord" FOR EACH ROW EXECUTE FUNCTION "validate_evidence_record_scope"();
CREATE TRIGGER "Scorecard_validate_scope" BEFORE INSERT ON "Scorecard" FOR EACH ROW EXECUTE FUNCTION "validate_scorecard_scope"();
CREATE TRIGGER "CriterionResultEvidence_validate_scope" BEFORE INSERT ON "CriterionResultEvidence" FOR EACH ROW EXECUTE FUNCTION "validate_criterion_evidence_scope"();
CREATE TRIGGER "EvidenceRecord_immutable_update" BEFORE UPDATE ON "EvidenceRecord" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "Scorecard_immutable_update" BEFORE UPDATE ON "Scorecard" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "CriterionResult_immutable_update" BEFORE UPDATE ON "CriterionResult" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "CriterionResultEvidence_immutable_update" BEFORE UPDATE ON "CriterionResultEvidence" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();

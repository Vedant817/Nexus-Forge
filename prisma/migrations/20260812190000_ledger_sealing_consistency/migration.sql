-- Seal evidence ledgers, make every ledger relation append-only, and attest scorecard arithmetic.
ALTER TABLE "AnalysisRun" ADD COLUMN "ledgerSealedAt" TIMESTAMP(3);

ALTER TABLE "Scorecard"
  ADD COLUMN "completenessBasisPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalWeight" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "knownWeight" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "passedWeight" INTEGER NOT NULL DEFAULT 0;

-- Derive safe values for any pre-existing unpublished scorecards.
UPDATE "Scorecard" AS scorecard SET
  "totalWeight" = totals."totalWeight",
  "knownWeight" = totals."knownWeight",
  "passedWeight" = totals."passedWeight",
  "completenessBasisPoints" = CASE WHEN totals."totalWeight" = 0 THEN 10000
    ELSE ROUND(totals."knownWeight" * 10000.0 / totals."totalWeight")::INTEGER END,
  "completenessRatio" = CASE WHEN totals."totalWeight" = 0 THEN 1
    ELSE ROUND(totals."knownWeight" * 10000.0 / totals."totalWeight") / 10000.0 END,
  "score" = CASE WHEN totals."totalWeight" > 0
      AND ROUND(totals."knownWeight" * 10000.0 / totals."totalWeight") >= 8000
    THEN ROUND(totals."passedWeight" * 100.0 / totals."totalWeight")::INTEGER ELSE NULL END
FROM (
  SELECT "scorecardId",
    COALESCE(SUM("weight") FILTER (WHERE "status" <> 'NOT_APPLICABLE'), 0)::INTEGER AS "totalWeight",
    COALESCE(SUM("weight") FILTER (WHERE "status" IN ('PASS','FAIL')), 0)::INTEGER AS "knownWeight",
    COALESCE(SUM("weight") FILTER (WHERE "status" = 'PASS'), 0)::INTEGER AS "passedWeight"
  FROM "CriterionResult" GROUP BY "scorecardId"
) AS totals WHERE scorecard."id" = totals."scorecardId";

ALTER TABLE "AnalysisRun" DROP CONSTRAINT "AnalysisRun_projectId_fkey";
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceRecord" DROP CONSTRAINT "EvidenceRecord_projectId_fkey";
ALTER TABLE "EvidenceRecord" DROP CONSTRAINT "EvidenceRecord_analysisRunId_fkey";
ALTER TABLE "EvidenceRecord" DROP CONSTRAINT "EvidenceRecord_analysisStageRunId_fkey";
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_analysisRunId_fkey"
  FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_analysisStageRunId_fkey"
  FOREIGN KEY ("analysisStageRunId") REFERENCES "AnalysisStageRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Scorecard" DROP CONSTRAINT "Scorecard_projectId_fkey";
ALTER TABLE "Scorecard" DROP CONSTRAINT "Scorecard_analysisRunId_fkey";
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_analysisRunId_fkey"
  FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CriterionResult" DROP CONSTRAINT "CriterionResult_scorecardId_fkey";
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_scorecardId_fkey"
  FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CriterionResultEvidence" DROP CONSTRAINT "CriterionResultEvidence_criterionResultId_fkey";
ALTER TABLE "CriterionResultEvidence" ADD CONSTRAINT "CriterionResultEvidence_criterionResultId_fkey"
  FOREIGN KEY ("criterionResultId") REFERENCES "CriterionResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "assert_analysis_ledger_open"("run_id" TEXT) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AnalysisRun"
    WHERE "id" = "run_id" AND "ledgerSealedAt" IS NULL
      AND "status" IN ('QUEUED','RUNNING','CANCEL_REQUESTED')
  ) THEN
    RAISE EXCEPTION 'Analysis evidence ledger is sealed or terminal';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "validate_ledger_record_insert"() RETURNS trigger AS $$
DECLARE run_id TEXT;
BEGIN
  IF LOWER(TG_TABLE_NAME) = 'evidencerecord' OR LOWER(TG_TABLE_NAME) = 'scorecard' THEN
    run_id := NEW."analysisRunId";
  ELSIF LOWER(TG_TABLE_NAME) = 'criterionresult' THEN
    SELECT "analysisRunId" INTO run_id FROM "Scorecard" WHERE "id" = NEW."scorecardId";
  ELSE
    SELECT scorecard."analysisRunId" INTO run_id
    FROM "CriterionResult" result JOIN "Scorecard" scorecard ON scorecard."id" = result."scorecardId"
    WHERE result."id" = NEW."criterionResultId";
  END IF;
  PERFORM "assert_analysis_ledger_open"(run_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EvidenceRecord_open_insert" BEFORE INSERT ON "EvidenceRecord" FOR EACH ROW EXECUTE FUNCTION "validate_ledger_record_insert"();
CREATE TRIGGER "Scorecard_open_insert" BEFORE INSERT ON "Scorecard" FOR EACH ROW EXECUTE FUNCTION "validate_ledger_record_insert"();
CREATE TRIGGER "CriterionResult_open_insert" BEFORE INSERT ON "CriterionResult" FOR EACH ROW EXECUTE FUNCTION "validate_ledger_record_insert"();
CREATE TRIGGER "CriterionResultEvidence_open_insert" BEFORE INSERT ON "CriterionResultEvidence" FOR EACH ROW EXECUTE FUNCTION "validate_ledger_record_insert"();

CREATE TRIGGER "EvidenceRecord_immutable_delete" BEFORE DELETE ON "EvidenceRecord" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "Scorecard_immutable_delete" BEFORE DELETE ON "Scorecard" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "CriterionResult_immutable_delete" BEFORE DELETE ON "CriterionResult" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();
CREATE TRIGGER "CriterionResultEvidence_immutable_delete" BEFORE DELETE ON "CriterionResultEvidence" FOR EACH ROW EXECUTE FUNCTION "prevent_evidence_ledger_update"();

ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_arithmetic_bounds" CHECK (
  "completenessBasisPoints" BETWEEN 0 AND 10000
  AND "totalWeight" >= 0 AND "knownWeight" >= 0 AND "passedWeight" >= 0
  AND "passedWeight" <= "knownWeight" AND "knownWeight" <= "totalWeight"
  AND ABS("completenessRatio" - "completenessBasisPoints" / 10000.0) < 0.0000001
  AND "applicableCount" >= 0 AND "evaluatedCount" >= 0 AND "passCount" >= 0
  AND "failCount" >= 0 AND "unknownCount" >= 0 AND "notApplicableCount" >= 0
  AND "evaluatedCount" = "passCount" + "failCount"
  AND (("totalWeight" = 0 AND "completenessBasisPoints" = 10000)
    OR ("totalWeight" > 0 AND "completenessBasisPoints" = ROUND("knownWeight" * 10000.0 / "totalWeight")::INTEGER))
  AND (("completenessBasisPoints" < 8000 AND "score" IS NULL)
    OR ("completenessBasisPoints" >= 8000 AND "totalWeight" = 0 AND "score" IS NULL)
    OR ("completenessBasisPoints" >= 8000 AND "totalWeight" > 0
      AND "score" = ROUND("passedWeight" * 100.0 / "totalWeight")::INTEGER))
);

CREATE FUNCTION "validate_scorecard_children"() RETURNS trigger AS $$
DECLARE target_id TEXT; c RECORD;
BEGIN
  IF LOWER(TG_TABLE_NAME) = 'scorecard' THEN
    target_id := NEW."id";
  ELSE
    target_id := NEW."scorecardId";
  END IF;
  SELECT scorecard.*,
    COUNT(result."id")::INTEGER AS criterion_count,
    COALESCE(SUM(result."weight") FILTER (WHERE result."status" <> 'NOT_APPLICABLE'), 0)::INTEGER AS total_weight,
    COALESCE(SUM(result."weight") FILTER (WHERE result."status" IN ('PASS','FAIL')), 0)::INTEGER AS known_weight,
    COALESCE(SUM(result."weight") FILTER (WHERE result."status" = 'PASS'), 0)::INTEGER AS passed_weight
  INTO c FROM "Scorecard" scorecard LEFT JOIN "CriterionResult" result ON result."scorecardId" = scorecard."id"
  WHERE scorecard."id" = target_id GROUP BY scorecard."id";
  IF c.criterion_count <> c."passCount" + c."failCount" + c."unknownCount" + c."notApplicableCount"
    OR c."applicableCount" <> c."passCount" + c."failCount" + c."unknownCount"
    OR c.total_weight <> c."totalWeight" OR c.known_weight <> c."knownWeight" OR c.passed_weight <> c."passedWeight" THEN
    RAISE EXCEPTION 'Scorecard aggregate fields do not match criterion results';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Scorecard_children_consistent" AFTER INSERT ON "Scorecard" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_scorecard_children"();
CREATE CONSTRAINT TRIGGER "CriterionResult_scorecard_consistent" AFTER INSERT ON "CriterionResult" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_scorecard_children"();

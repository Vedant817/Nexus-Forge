ALTER TABLE "Workflow"
  ADD COLUMN "humanState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "humanEdited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Project" ADD COLUMN "editRevision" INTEGER NOT NULL DEFAULT 0;

UPDATE "Workflow" SET "revision" = 1;

DO $$
DECLARE
  item RECORD;
  tasks JSONB;
  criteria JSONB;
  completed JSONB;
  generated JSONB;
BEGIN
  FOR item IN
    SELECT workflow.*, project."activeAnalysisRunId"
    FROM "Workflow" AS workflow
    JOIN "Project" AS project ON project."id" = workflow."projectId"
  LOOP
    BEGIN tasks := item."tasksJson"::jsonb; EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    BEGIN criteria := item."acceptanceCriteria"::jsonb; EXCEPTION WHEN OTHERS THEN criteria := '[]'::jsonb; END;
    BEGIN completed := item."completedAcceptanceCriteria"::jsonb; EXCEPTION WHEN OTHERS THEN completed := '[]'::jsonb; END;
    BEGIN generated := item."rawOutput"::jsonb; EXCEPTION WHEN OTHERS THEN generated := '{}'::jsonb; END;

    IF completed <> '[]'::jsonb OR (generated ? 'tasks' AND tasks IS DISTINCT FROM generated->'tasks') THEN
      UPDATE "Workflow"
      SET "humanEdited" = true,
          "humanState" = jsonb_build_object(
            'version', 1,
            'baseAnalysisRunId', item."activeAnalysisRunId",
            'tasks', tasks,
            'acceptanceCriteria', criteria,
            'completedAcceptanceCriteria', completed
          )
      WHERE "id" = item."id";
    END IF;
  END LOOP;
END $$;

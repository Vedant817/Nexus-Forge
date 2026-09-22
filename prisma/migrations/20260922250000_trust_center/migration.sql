ALTER TABLE "Project" ADD COLUMN "excludedPaths" JSONB NOT NULL DEFAULT '[]'::jsonb;

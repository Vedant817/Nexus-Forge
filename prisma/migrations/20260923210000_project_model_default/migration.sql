-- Project-level default model selection. NULL means platform default.
ALTER TABLE "Project"
  ADD COLUMN "llmProvider" TEXT,
  ADD COLUMN "llmModel" TEXT;

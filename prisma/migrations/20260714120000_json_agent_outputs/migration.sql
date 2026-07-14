-- Convert structured agent output columns from stringified JSON text to real JSONB.
ALTER TABLE "KnowledgeSummary"
  ALTER COLUMN "keyConcepts" TYPE JSONB USING "keyConcepts"::jsonb,
  ALTER COLUMN "keyConcepts" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "implementationPatterns" TYPE JSONB USING "implementationPatterns"::jsonb,
  ALTER COLUMN "implementationPatterns" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "buildableTasks" TYPE JSONB USING "buildableTasks"::jsonb,
  ALTER COLUMN "buildableTasks" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "warningsOrPitfalls" TYPE JSONB USING "warningsOrPitfalls"::jsonb,
  ALTER COLUMN "warningsOrPitfalls" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "termsToUnderstand" TYPE JSONB USING "termsToUnderstand"::jsonb,
  ALTER COLUMN "termsToUnderstand" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "sourceEvidence" TYPE JSONB USING "sourceEvidence"::jsonb,
  ALTER COLUMN "sourceEvidence" SET DEFAULT '[]'::jsonb;

ALTER TABLE "RepoAnalysis"
  ALTER COLUMN "detectedStack" TYPE JSONB USING "detectedStack"::jsonb,
  ALTER COLUMN "detectedStack" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "importantFiles" TYPE JSONB USING "importantFiles"::jsonb,
  ALTER COLUMN "importantFiles" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "likelyFeatureLocations" TYPE JSONB USING "likelyFeatureLocations"::jsonb,
  ALTER COLUMN "likelyFeatureLocations" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "testLocations" TYPE JSONB USING "testLocations"::jsonb,
  ALTER COLUMN "testLocations" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "missingItems" TYPE JSONB USING "missingItems"::jsonb,
  ALTER COLUMN "missingItems" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "risks" TYPE JSONB USING "risks"::jsonb,
  ALTER COLUMN "risks" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "recommendedFixes" TYPE JSONB USING "recommendedFixes"::jsonb,
  ALTER COLUMN "recommendedFixes" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "graphJson" TYPE JSONB USING COALESCE(NULLIF("graphJson", 'null')::jsonb, '{}'::jsonb),
  ALTER COLUMN "graphJson" SET DEFAULT '{}'::jsonb;

ALTER TABLE "Workflow"
  ALTER COLUMN "tasksJson" TYPE JSONB USING "tasksJson"::jsonb,
  ALTER COLUMN "tasksJson" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "acceptanceCriteria" TYPE JSONB USING "acceptanceCriteria"::jsonb,
  ALTER COLUMN "acceptanceCriteria" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "completedAcceptanceCriteria" TYPE JSONB USING "completedAcceptanceCriteria"::jsonb,
  ALTER COLUMN "completedAcceptanceCriteria" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "expectedFiles" TYPE JSONB USING "expectedFiles"::jsonb,
  ALTER COLUMN "expectedFiles" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "reviewChecklist" TYPE JSONB USING "reviewChecklist"::jsonb,
  ALTER COLUMN "reviewChecklist" SET DEFAULT '[]'::jsonb;

ALTER TABLE "ReleaseReport"
  ALTER COLUMN "topRisks" TYPE JSONB USING "topRisks"::jsonb,
  ALTER COLUMN "topRisks" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "missingTests" TYPE JSONB USING "missingTests"::jsonb,
  ALTER COLUMN "missingTests" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "missingDocs" TYPE JSONB USING "missingDocs"::jsonb,
  ALTER COLUMN "missingDocs" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "configOrEnvIssues" TYPE JSONB USING "configOrEnvIssues"::jsonb,
  ALTER COLUMN "configOrEnvIssues" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "backwardCompatibility" TYPE JSONB USING "backwardCompatibility"::jsonb,
  ALTER COLUMN "backwardCompatibility" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "releaseChecklist" TYPE JSONB USING "releaseChecklist"::jsonb,
  ALTER COLUMN "releaseChecklist" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "recommendedFixesBeforeMerge" TYPE JSONB USING "recommendedFixesBeforeMerge"::jsonb,
  ALTER COLUMN "recommendedFixesBeforeMerge" SET DEFAULT '[]'::jsonb;

ALTER TABLE "ProofPack"
  ALTER COLUMN "missingProofItems" TYPE JSONB USING "missingProofItems"::jsonb,
  ALTER COLUMN "missingProofItems" SET DEFAULT '[]'::jsonb;

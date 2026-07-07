-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "repoUrl" TEXT NOT NULL DEFAULT '',
    "prUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "rawContent" TEXT NOT NULL,
    "documentId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mainTopic" TEXT NOT NULL DEFAULT '',
    "keyConcepts" TEXT NOT NULL DEFAULT '[]',
    "implementationPatterns" TEXT NOT NULL DEFAULT '[]',
    "buildableTasks" TEXT NOT NULL DEFAULT '[]',
    "warningsOrPitfalls" TEXT NOT NULL DEFAULT '[]',
    "termsToUnderstand" TEXT NOT NULL DEFAULT '[]',
    "sourceEvidence" TEXT NOT NULL DEFAULT '[]',
    "recommendedNextAction" TEXT NOT NULL DEFAULT '',
    "rawOutput" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL DEFAULT '',
    "detectedStack" TEXT NOT NULL DEFAULT '[]',
    "architectureSummary" TEXT NOT NULL DEFAULT '',
    "importantFiles" TEXT NOT NULL DEFAULT '[]',
    "likelyFeatureLocations" TEXT NOT NULL DEFAULT '[]',
    "testLocations" TEXT NOT NULL DEFAULT '[]',
    "setupQuality" TEXT NOT NULL DEFAULT '',
    "missingItems" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "maturityScore" INTEGER NOT NULL DEFAULT 0,
    "recommendedFixes" TEXT NOT NULL DEFAULT '[]',
    "rawOutput" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "objective" TEXT NOT NULL DEFAULT '',
    "tasksJson" TEXT NOT NULL DEFAULT '[]',
    "acceptanceCriteria" TEXT NOT NULL DEFAULT '[]',
    "testPlan" TEXT NOT NULL DEFAULT '',
    "expectedFiles" TEXT NOT NULL DEFAULT '[]',
    "reviewChecklist" TEXT NOT NULL DEFAULT '[]',
    "rawOutput" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "releaseScore" INTEGER NOT NULL DEFAULT 0,
    "decision" TEXT NOT NULL DEFAULT '',
    "topRisks" TEXT NOT NULL DEFAULT '[]',
    "missingTests" TEXT NOT NULL DEFAULT '[]',
    "missingDocs" TEXT NOT NULL DEFAULT '[]',
    "configOrEnvIssues" TEXT NOT NULL DEFAULT '[]',
    "backwardCompatibility" TEXT NOT NULL DEFAULT '[]',
    "releaseChecklist" TEXT NOT NULL DEFAULT '[]',
    "releaseNotesDraft" TEXT NOT NULL DEFAULT '',
    "recommendedFixesBeforeMerge" TEXT NOT NULL DEFAULT '[]',
    "rawOutput" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofPack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "portfolioSummary" TEXT NOT NULL DEFAULT '',
    "resumeBullet" TEXT NOT NULL DEFAULT '',
    "demoVideoScript" TEXT NOT NULL DEFAULT '',
    "interviewExplanation" TEXT NOT NULL DEFAULT '',
    "linkedinPost" TEXT NOT NULL DEFAULT '',
    "proofScore" INTEGER NOT NULL DEFAULT 0,
    "missingProofItems" TEXT NOT NULL DEFAULT '[]',
    "rawOutput" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSummary_projectId_key" ON "KnowledgeSummary"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoAnalysis_projectId_key" ON "RepoAnalysis"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_projectId_key" ON "Workflow"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseReport_projectId_key" ON "ReleaseReport"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProofPack_projectId_key" ON "ProofPack"("projectId");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSummary" ADD CONSTRAINT "KnowledgeSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoAnalysis" ADD CONSTRAINT "RepoAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseReport" ADD CONSTRAINT "ReleaseReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofPack" ADD CONSTRAINT "ProofPack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

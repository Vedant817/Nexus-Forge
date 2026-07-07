-- AlterTable
ALTER TABLE "RepoAnalysis" ADD COLUMN     "graphJson" TEXT NOT NULL DEFAULT 'null';

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "completedAcceptanceCriteria" TEXT NOT NULL DEFAULT '[]';

import { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { getDocumentStore } from '@/lib/db/store'
import { getAgentRunner } from '@/lib/agents/ai-runner'
import { fetchRepoContext, fetchPRContext } from '@/lib/github'
import { logAudit } from '@/lib/security/audit-log'
import { redactSecrets } from '@/lib/security/secret-redaction'
import type {
  PipelineResult,
  KnowledgeDistillerInput,
  RepoContextAgentInput,
  WorkflowPlannerInput,
  ReleaseReadinessInput,
  ProofOfWorkInput,
} from '@/types'

export async function runNexusForgePipeline(projectId: string): Promise<PipelineResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { sources: true },
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  if (project.sources.length === 0 && !project.repoUrl) {
    throw new Error('Project must have at least one source and/or repo URL')
  }

  if (project.status === 'analyzing') {
    throw new Error('Analysis already running for this project')
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: 'analyzing' } })
  await logAudit('analysis_started', 'Pipeline started', projectId)

  try {
    await prisma.knowledgeSummary.deleteMany({ where: { projectId } }).catch(() => {})
    await prisma.repoAnalysis.deleteMany({ where: { projectId } }).catch(() => {})
    await prisma.workflow.deleteMany({ where: { projectId } }).catch(() => {})
    await prisma.releaseReport.deleteMany({ where: { projectId } }).catch(() => {})
    await prisma.proofPack.deleteMany({ where: { projectId } }).catch(() => {})

    const documentStore = getDocumentStore()
    const agentRunner = await getAgentRunner()

    for (const source of project.sources) {
      await documentStore.store(source.id, source.rawContent, {
        projectId,
        type: source.type,
        title: source.title,
      })
    }

    const sources = project.sources.map(s => ({
      type: s.type,
      title: s.title,
      content: s.rawContent,
    }))

    const knowledgeInput: KnowledgeDistillerInput = { sources }
    await prisma.project.update({ where: { id: projectId }, data: { status: 'analyzing:knowledge' } })
    const knowledgeOutput = await agentRunner.runKnowledgeDistiller(knowledgeInput)
    await logAudit('agent_completed', 'Knowledge Distiller finished', projectId)

    const redactedKnowledge = {
      ...knowledgeOutput,
      sourceEvidence: knowledgeOutput.sourceEvidence.map(s => redactSecrets(s)),
    }
    Object.assign(knowledgeOutput, redactedKnowledge)

    await prisma.knowledgeSummary.upsert({
      where: { projectId },
      create: {
        projectId,
        mainTopic: knowledgeOutput.mainTopic,
        keyConcepts: knowledgeOutput.keyConcepts,
        implementationPatterns: knowledgeOutput.implementationPatterns,
        buildableTasks: knowledgeOutput.buildableTasks,
        warningsOrPitfalls: knowledgeOutput.warningsOrPitfalls,
        termsToUnderstand: knowledgeOutput.termsToUnderstand,
        sourceEvidence: knowledgeOutput.sourceEvidence,
        recommendedNextAction: knowledgeOutput.recommendedNextAction,
        rawOutput: JSON.stringify(knowledgeOutput),
      },
      update: {
        mainTopic: knowledgeOutput.mainTopic,
        keyConcepts: knowledgeOutput.keyConcepts,
        implementationPatterns: knowledgeOutput.implementationPatterns,
        buildableTasks: knowledgeOutput.buildableTasks,
        warningsOrPitfalls: knowledgeOutput.warningsOrPitfalls,
        termsToUnderstand: knowledgeOutput.termsToUnderstand,
        sourceEvidence: knowledgeOutput.sourceEvidence,
        recommendedNextAction: knowledgeOutput.recommendedNextAction,
        rawOutput: JSON.stringify(knowledgeOutput),
      },
    })

    let repoAnalysisOutput = undefined
    if (project.repoUrl) {
      await logAudit('github_fetched', `Fetching repo: ${project.repoUrl}`, projectId)

      let repoContext
      try {
        repoContext = await fetchRepoContext(project.repoUrl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await logAudit('error', `GitHub fetch failed: ${msg}`, projectId)
        repoContext = undefined
      }

      if (repoContext) {
        const repoInput: RepoContextAgentInput = {
          repoUrl: project.repoUrl,
          readme: repoContext.readme,
          folderTree: [
            ...repoContext.tree,
            '',
            'Inspected files:',
            ...repoContext.inspectedFiles,
            '',
            'Config files:',
            ...repoContext.configFiles,
            '',
            'Test files:',
            ...repoContext.testFiles,
            '',
            'Security/auth/middleware files:',
            ...repoContext.securityFiles,
          ].join('\n'),
          packageJson: repoContext.packageJson,
          requirementsTxt: repoContext.requirementsTxt,
          pyprojectToml: repoContext.pyprojectToml,
          dockerfile: repoContext.dockerfile,
          dockerCompose: repoContext.dockerCompose,
          githubWorkflows: repoContext.githubWorkflows,
          envExample: repoContext.envExample,
        }

        await prisma.project.update({ where: { id: projectId }, data: { status: 'analyzing:repo' } })
        repoAnalysisOutput = await agentRunner.runRepoContextAgent(repoInput)
        await logAudit('agent_completed', 'Repo Context Agent finished', projectId)

        await prisma.repoAnalysis.upsert({
          where: { projectId },
          create: {
            projectId,
            repoUrl: project.repoUrl,
            detectedStack: repoAnalysisOutput.detectedStack,
            architectureSummary: repoAnalysisOutput.architectureSummary,
            importantFiles: repoAnalysisOutput.importantFiles,
            likelyFeatureLocations: repoAnalysisOutput.likelyFeatureLocations,
            testLocations: repoAnalysisOutput.testLocations,
            setupQuality: repoAnalysisOutput.setupQuality,
            missingItems: repoAnalysisOutput.missingItems,
            risks: repoAnalysisOutput.risks,
            maturityScore: repoAnalysisOutput.maturityScore,
            recommendedFixes: repoAnalysisOutput.recommendedFixes,
            rawOutput: JSON.stringify(repoAnalysisOutput),
          },
          update: {
            repoUrl: project.repoUrl,
            detectedStack: repoAnalysisOutput.detectedStack,
            architectureSummary: repoAnalysisOutput.architectureSummary,
            importantFiles: repoAnalysisOutput.importantFiles,
            likelyFeatureLocations: repoAnalysisOutput.likelyFeatureLocations,
            testLocations: repoAnalysisOutput.testLocations,
            setupQuality: repoAnalysisOutput.setupQuality,
            missingItems: repoAnalysisOutput.missingItems,
            risks: repoAnalysisOutput.risks,
            maturityScore: repoAnalysisOutput.maturityScore,
            recommendedFixes: repoAnalysisOutput.recommendedFixes,
            rawOutput: JSON.stringify(repoAnalysisOutput),
          },
        })
      }
    }

    const workflowInput: WorkflowPlannerInput = {
      projectGoal: project.goal || 'Build project based on learning sources',
      knowledgeSummary: knowledgeOutput,
      repoAnalysis: repoAnalysisOutput,
    }

    await prisma.project.update({ where: { id: projectId }, data: { status: 'analyzing:workflow' } })
    const workflowOutput = await agentRunner.runWorkflowPlanner(workflowInput)
    await logAudit('agent_completed', 'Workflow Planner finished', projectId)

    await prisma.workflow.upsert({
      where: { projectId },
      create: {
        projectId,
        title: workflowOutput.workflowTitle,
        objective: workflowOutput.objective,
        tasksJson: workflowOutput.tasks as unknown as Prisma.InputJsonValue,
        acceptanceCriteria: workflowOutput.acceptanceCriteria,
        testPlan: workflowOutput.testPlan,
        expectedFiles: workflowOutput.expectedFilesToChange,
        reviewChecklist: workflowOutput.reviewChecklist,
        rawOutput: JSON.stringify(workflowOutput),
      },
      update: {
        title: workflowOutput.workflowTitle,
        objective: workflowOutput.objective,
        tasksJson: workflowOutput.tasks as unknown as Prisma.InputJsonValue,
        acceptanceCriteria: workflowOutput.acceptanceCriteria,
        testPlan: workflowOutput.testPlan,
        expectedFiles: workflowOutput.expectedFilesToChange,
        reviewChecklist: workflowOutput.reviewChecklist,
        rawOutput: JSON.stringify(workflowOutput),
      },
    })

    let releaseOutput = undefined
    let prContext = undefined
    if (project.prUrl) {
      await logAudit('github_fetched', `Fetching PR: ${project.prUrl}`, projectId)

      try {
        prContext = await fetchPRContext(project.prUrl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await logAudit('error', `PR fetch failed: ${msg}`, projectId)
      }
    }

    if (prContext) {
      const releaseInput: ReleaseReadinessInput = {
        prUrl: project.prUrl,
        prDiff: prContext.diff,
        changedFiles: prContext.changedFiles,
        workflowAcceptanceCriteria: workflowOutput.acceptanceCriteria,
        repoAnalysis: repoAnalysisOutput,
      }

      await prisma.project.update({ where: { id: projectId }, data: { status: 'analyzing:release' } })
      releaseOutput = await agentRunner.runReleaseReadiness(releaseInput)
      await logAudit('agent_completed', 'Release Readiness Agent finished', projectId)

      await prisma.releaseReport.upsert({
        where: { projectId },
        create: {
          projectId,
          releaseScore: releaseOutput.releaseScore,
          decision: releaseOutput.decision,
          topRisks: releaseOutput.topRisks,
          missingTests: releaseOutput.missingTests,
          missingDocs: releaseOutput.missingDocs,
          configOrEnvIssues: releaseOutput.configOrEnvIssues,
          backwardCompatibility: releaseOutput.backwardCompatibilityConcerns,
          releaseChecklist: releaseOutput.releaseChecklist,
          releaseNotesDraft: releaseOutput.releaseNotesDraft,
          recommendedFixesBeforeMerge: releaseOutput.recommendedFixesBeforeMerge,
          rawOutput: JSON.stringify(releaseOutput),
        },
        update: {
          releaseScore: releaseOutput.releaseScore,
          decision: releaseOutput.decision,
          topRisks: releaseOutput.topRisks,
          missingTests: releaseOutput.missingTests,
          missingDocs: releaseOutput.missingDocs,
          configOrEnvIssues: releaseOutput.configOrEnvIssues,
          backwardCompatibility: releaseOutput.backwardCompatibilityConcerns,
          releaseChecklist: releaseOutput.releaseChecklist,
          releaseNotesDraft: releaseOutput.releaseNotesDraft,
          recommendedFixesBeforeMerge: releaseOutput.recommendedFixesBeforeMerge,
          rawOutput: JSON.stringify(releaseOutput),
        },
      })
    }

    const proofInput: ProofOfWorkInput = {
      projectGoal: project.goal || 'Build project with AI-assisted development',
      workflowOutput,
      repoAnalysis: repoAnalysisOutput,
      releaseReport: releaseOutput,
      finalSummary: `Completed analysis of ${project.sources.length} sources${project.repoUrl ? ' and repo ' + project.repoUrl : ''}`,
    }

    await prisma.project.update({ where: { id: projectId }, data: { status: 'analyzing:proof' } })
    const proofOutput = await agentRunner.runProofOfWork(proofInput)
    await logAudit('agent_completed', 'Proof of Work Agent finished', projectId)

    await prisma.proofPack.upsert({
      where: { projectId },
      create: {
        projectId,
        portfolioSummary: proofOutput.portfolioSummary,
        resumeBullet: proofOutput.resumeBullet,
        demoVideoScript: proofOutput.demoVideoScript,
        interviewExplanation: proofOutput.interviewExplanation,
        linkedinPost: proofOutput.linkedinPost,
        proofScore: proofOutput.proofScore,
        missingProofItems: proofOutput.missingProofItems,
        rawOutput: JSON.stringify(proofOutput),
      },
      update: {
        portfolioSummary: proofOutput.portfolioSummary,
        resumeBullet: proofOutput.resumeBullet,
        demoVideoScript: proofOutput.demoVideoScript,
        interviewExplanation: proofOutput.interviewExplanation,
        linkedinPost: proofOutput.linkedinPost,
        proofScore: proofOutput.proofScore,
        missingProofItems: proofOutput.missingProofItems,
        rawOutput: JSON.stringify(proofOutput),
      },
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'completed', updatedAt: new Date() },
    })
    await logAudit('analysis_completed', 'Pipeline completed successfully', projectId)

    return {
      projectId,
      knowledge: knowledgeOutput,
      repoAnalysis: repoAnalysisOutput,
      workflow: workflowOutput,
      releaseReport: releaseOutput,
      proofPack: proofOutput,
    }
  } catch (err) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'error', updatedAt: new Date() },
    })
    await logAudit('analysis_failed', err instanceof Error ? err.message : 'Unknown error', projectId)
    throw err
  }
}

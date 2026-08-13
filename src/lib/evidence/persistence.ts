import type { Prisma } from '@prisma/client'
import { evaluateScorecard } from './evaluate'
import type { EvaluatedScorecard, EvidenceView, ScorecardKindValue } from './types'

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

export type PublishedScorecards = Record<ScorecardKindValue, EvaluatedScorecard>

export async function persistEvidenceScorecards(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string
    analysisRunId: string
    stageIds: Partial<Record<string, string>>
    evidence: EvidenceView[]
    evaluatedAt: Date
  },
): Promise<PublishedScorecards> {
  const stableIds = input.evidence.map((record) => record.stableEvidenceId)
  if (new Set(stableIds).size !== stableIds.length) {
    throw new Error('Evidence input contains duplicate stable evidence IDs.')
  }

  const existing = await tx.scorecard.findMany({
    where: { analysisRunId: input.analysisRunId },
    select: { kind: true },
  })
  if (existing.length > 0) {
    throw new Error('Immutable scorecards already exist for this analysis run.')
  }

  for (const record of input.evidence) {
    await tx.evidenceRecord.create({
      data: {
        projectId: input.projectId,
        analysisRunId: input.analysisRunId,
        analysisStageRunId: record.evidenceType.startsWith('repository.') ? input.stageIds.REPOSITORY
          : record.evidenceType.startsWith('pull_request.') ? input.stageIds.RELEASE
          : record.evidenceType.startsWith('proof.') ? input.stageIds.PROOF
          : undefined,
        stableEvidenceId: record.stableEvidenceId,
        evidenceType: record.evidenceType,
        source: record.source,
        collectorId: record.collectorId,
        collectorVersion: record.collectorVersion,
        observedAt: record.observedAt,
        repositoryFullName: record.repositoryFullName,
        commitSha: record.commitSha,
        path: record.path,
        lineStart: record.lineStart,
        lineEnd: record.lineEnd,
        checkId: record.checkId,
        contentHash: record.contentHash,
        facts: asJson(record.facts),
        provenance: record.provenance,
        confidence: record.confidence,
      },
    })
  }
  const persisted = await tx.evidenceRecord.findMany({
    where: { analysisRunId: input.analysisRunId },
    select: { id: true, stableEvidenceId: true },
  })
  const evidenceIds = new Map(persisted.map((record) => [record.stableEvidenceId, record.id]))
  const kinds: ScorecardKindValue[] = ['REPOSITORY_MATURITY', 'RELEASE_READINESS', 'PROOF_COMPLETENESS']
  const output = {} as PublishedScorecards

  for (const kind of kinds) {
    const evaluated = evaluateScorecard(kind, input.evidence)
    for (const result of evaluated.results) {
      for (const stableId of result.evidenceStableIds) {
        if (!evidenceIds.has(stableId)) {
          throw new Error(`Criterion ${result.criterionId} references missing evidence ${stableId}.`)
        }
      }
    }
    output[kind] = evaluated
    await tx.scorecard.create({
      data: {
        projectId: input.projectId,
        analysisRunId: input.analysisRunId,
        kind,
        version: evaluated.version,
        score: evaluated.score,
        completenessRatio: evaluated.completenessRatio,
        completenessBasisPoints: evaluated.completenessBasisPoints,
        totalWeight: evaluated.totalWeight,
        knownWeight: evaluated.knownWeight,
        passedWeight: evaluated.passedWeight,
        applicableCount: evaluated.applicableCount,
        evaluatedCount: evaluated.evaluatedCount,
        passCount: evaluated.passCount,
        failCount: evaluated.failCount,
        unknownCount: evaluated.unknownCount,
        notApplicableCount: evaluated.notApplicableCount,
        criterionResults: {
          create: evaluated.results.map((result) => ({
            criterionId: result.criterionId,
            criterionVersion: result.criterionVersion,
            status: result.status,
            weight: result.weight,
            reasonCode: result.reasonCode,
            reason: result.reason,
            evaluatedAt: input.evaluatedAt,
            evidenceLinks: {
              create: result.evidenceStableIds.map((stableId) => ({
                evidenceRecordId: evidenceIds.get(stableId)!,
              })),
            },
          })),
        },
      },
    })
  }
  return output
}

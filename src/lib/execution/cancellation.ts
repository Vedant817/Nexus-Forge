import 'server-only'

import prisma from '@/lib/db/prisma'

export async function requestAnalysisCancellation(input: {
  runId: string
  projectId: string
  ownerId: string
  reason?: string
}): Promise<'requested' | 'terminal' | 'not_found'> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status"::text
      FROM "AnalysisRun"
      WHERE "id" = ${input.runId}
        AND "projectId" = ${input.projectId}
        AND "ownerId" = ${input.ownerId}
      FOR UPDATE
    `
    const run = rows[0]
    if (!run) return 'not_found'
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.status)) return 'terminal'

    await tx.analysisRun.update({
      where: { id: run.id },
      data: {
        status: 'CANCEL_REQUESTED',
        cancelRequestedAt: new Date(),
        cancellationReason: input.reason?.slice(0, 500) || 'Requested by user',
      },
    })
    return 'requested'
  })
}

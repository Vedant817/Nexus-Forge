import prisma from '@/lib/db/prisma'

export async function notifyRunCompleted(input: { userId: string; projectId: string; runId: string; status: string; digestId?: string }): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId, projectId: input.projectId, runId: input.runId, kind: 'run_completed',
      title: `Run ${input.status.toLowerCase()}`,
      body: `/projects/${input.projectId}/runs?query=${input.runId} · manifest /api/projects/${input.projectId}/runs/${input.runId}/manifest${input.digestId ? ` · digest ${input.digestId}` : ''}`,
    },
  })
}

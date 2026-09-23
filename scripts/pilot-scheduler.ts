// Pilot schedule runner (invoke weekly via cron). Triggers due schedules once;
// enqueue prevents duplicates when a run is already active.
import 'dotenv/config'
import prisma from '@/lib/db/prisma'
import { enqueueAnalysis } from '@/lib/execution/enqueue-analysis'
import { cleanupRateLimitBuckets, reconcileOrphanedReservations } from '@/lib/execution/reconciliation'

async function main(): Promise<void> {
  await reconcileOrphanedReservations()
  await cleanupRateLimitBuckets()
  const due = await prisma.pilotSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: new Date() } }, select: { projectId: true } })
  for (const schedule of due) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: schedule.projectId },
        select: { id: true, ownerId: true, githubInstallationId: true, githubBindingStatus: true },
      })
      if (!project?.ownerId) continue
      const triggerSettings = await prisma.triggerSettings.findUnique({ where: { projectId: project.id } })
      const { isQuietNow } = await import('@/lib/pilot/triggers')
      if (isQuietNow({ quietStartHour: triggerSettings?.quietStartHour ?? null, quietEndHour: triggerSettings?.quietEndHour ?? null })) {
        await prisma.pilotSchedule.update({ where: { projectId: project.id }, data: { nextRunAt: new Date(Date.now() + 3600_000) } })
        continue
      }
      if (project.githubBindingStatus === 'active' && project.githubInstallationId) {
        try {
          const { createGitHubAppJwt } = await import('@/lib/github/app-auth')
          const { githubJson } = await import('@/lib/github/http')
          const installation = await githubJson<{ suspended_at: string | null; permissions: Record<string, string> }>(
            `/app/installations/${encodeURIComponent(project.githubInstallationId)}`,
            { token: createGitHubAppJwt() },
          )
          if (installation.suspended_at || !['read', 'write'].includes(installation.permissions?.contents ?? '')) {
            await prisma.project.updateMany({ where: { id: project.id }, data: { githubBindingStatus: 'reconciliation_required', githubBindingDisabledAt: new Date() } })
            continue
          }
        } catch {
          continue
        }
      }
      await enqueueAnalysis(project.id, project.ownerId)
      await prisma.pilotSchedule.update({ where: { projectId: project.id }, data: { lastRunAt: new Date(), nextRunAt: new Date(Date.now() + 7 * 24 * 3600_000) } })
      console.log(`Scheduled run enqueued for ${project.id}`)
    } catch (error) {
      console.log(`Schedule skipped for ${schedule.projectId}: ${error instanceof Error ? error.message : 'unknown'}`)
      await prisma.pilotSchedule.update({ where: { projectId: schedule.projectId }, data: { nextRunAt: new Date(Date.now() + 7 * 24 * 3600_000) } })
    }
  }
}

void main()

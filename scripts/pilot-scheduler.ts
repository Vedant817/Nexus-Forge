// Pilot schedule runner (invoke weekly via cron). Triggers due schedules once;
// enqueue prevents duplicates when a run is already active.
import prisma from '@/lib/db/prisma'
import { enqueueAnalysis } from '@/lib/execution/enqueue-analysis'

async function main(): Promise<void> {
  const due = await prisma.pilotSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: new Date() } }, select: { projectId: true } })
  for (const schedule of due) {
    try {
      const project = await prisma.project.findUnique({ where: { id: schedule.projectId }, select: { id: true, ownerId: true } })
      if (!project?.ownerId) continue
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

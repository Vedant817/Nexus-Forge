import { JobKind } from '@prisma/client'
import { executeAnalysisJob } from '@/lib/workflows/nexus-forge-pipeline'
import { executeWebhookJob } from './webhook-worker'
import { type ClaimedJob, PrismaJobLeaseRepository } from './job-repository'
import { DEFAULT_LEASE_MS } from './constants'
import { runWorkerOnce } from './worker-core'

export async function handleDurableJob(job: ClaimedJob, signal: AbortSignal): Promise<void> {
  if (job.kind === JobKind.ANALYSIS) {
    await executeAnalysisJob(job, signal)
    return
  }
  if (job.kind === JobKind.WEBHOOK) {
    await executeWebhookJob(job, signal)
    return
  }
  throw new Error(`Unsupported job kind: ${job.kind}`)
}

export async function runAnalysisWorker(options: {
  workerId: string
  once?: boolean
  signal?: AbortSignal
  pollMs?: number
  leaseMs?: number
}): Promise<void> {
  const repository = new PrismaJobLeaseRepository()
  const pollMs = options.pollMs ?? 1_000
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS

  do {
    if (options.signal?.aborted) break
    const result = await runWorkerOnce({
      repository,
      handler: handleDurableJob,
      workerId: options.workerId,
      leaseMs,
    })
    if (options.once) break
    if (result === 'idle') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs)
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        }, { once: true })
      })
    }
  } while (!options.signal?.aborted)
}

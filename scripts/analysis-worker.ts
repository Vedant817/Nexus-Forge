import 'dotenv/config'

import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { validateWorkerEnvironment } from '../src/lib/execution/worker-environment'

async function main(): Promise<void> {

  validateWorkerEnvironment(process.env)
  const [{ runAnalysisWorker }, { default: prisma }] = await Promise.all([
    import('../src/lib/execution/analysis-worker'),
    import('../src/lib/db/prisma'),
  ])

  const controller = new AbortController()
  let shutdownRequested = false
  function shutdown() {
    if (shutdownRequested) return
    shutdownRequested = true
    controller.abort()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  const once = process.argv.includes('--once')
  const workerId = process.env.WORKER_ID ?? `${hostname()}:${process.pid}:${randomUUID()}`
  const leaseMs = Number(process.env.ANALYSIS_JOB_LEASE_MS ?? 60_000)
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000) {
    throw new Error('ANALYSIS_JOB_LEASE_MS must be an integer of at least 5000 milliseconds.')
  }

  try {
    await runAnalysisWorker({ workerId, once, signal: controller.signal, leaseMs })
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Script failed')
  process.exitCode = 1
})

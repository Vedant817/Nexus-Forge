import type { ClaimedJob, JobLeaseRepository } from './job-repository'
import { LeaseLostError } from './errors'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { logStructured } from '@/lib/observability/logger'
import { AiBudgetExceededError } from '@/lib/ai/budget-errors'
import { ModelBoundaryError } from '@/lib/ai/errors'

export class AnalysisCancelledError extends Error {
  constructor() {
    super('Analysis was cancelled.')
    this.name = 'AnalysisCancelledError'
  }
}

export class InvalidJobTupleError extends Error {
  constructor() {
    super('Persisted job relationships failed validation.')
    this.name = 'InvalidJobTupleError'
  }
}

export type FailureClassification = {
  failureClass: string
  code: string
  message: string
  transient: boolean
}

export function classifyFailure(error: unknown): FailureClassification {
  if (error instanceof ModelBoundaryError) {
    return {
      failureClass: error.transient ? 'TRANSIENT' : 'PERMANENT',
      code: error.code,
      message: error.message,
      transient: error.transient,
    }
  }
  if (error instanceof AiBudgetExceededError) {
    return {
      failureClass: 'PERMANENT',
      code: error.code,
      message: 'The configured AI budget is exhausted.',
      transient: false,
    }
  }
  const diagnostic = error instanceof Error ? error.message : 'Unknown worker failure'
  const name = error instanceof Error ? error.name : 'UnknownError'
  const normalized = `${name} ${diagnostic}`.toLowerCase()
  const transient = error instanceof LeaseLostError
    || /(lease|heartbeat|timeout|timed out|aborterror|rate limit|429|5\d\d|network|fetch failed|econn|p1001|temporar)/.test(normalized)
  let message = transient
    ? 'A temporary dependency or worker lease failure interrupted this operation.'
    : 'The operation failed safely. Use the failure code to locate bounded server diagnostics.'
  if (/(parse|schema|validation|invalid.*output)/.test(normalized)) {
    message = 'The provider returned invalid structured output.'
  } else if (/(configuration|unsupported persisted|api key|environment)/.test(normalized)) {
    message = 'The persisted execution configuration is unavailable or unsupported.'
  } else if (error instanceof InvalidJobTupleError) {
    message = 'The durable job failed relationship validation.'
  }
  return {
    failureClass: transient ? 'TRANSIENT' : 'PERMANENT',
    code: name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 100) || 'UnknownError',
    message,
    transient,
  }
}

function logBoundedDiagnostic(job: ClaimedJob, phase: string, error: unknown): void {
  const raw = error instanceof Error ? error.message : String(error)
  const message = /(parse|schema|validation|invalid.*output|no object generated)/i.test(raw)
    ? 'Provider returned invalid structured output (details suppressed).'
    : redactSecrets(raw).slice(0, 1_000)
  logStructured('error', `[durable-worker] ${phase}: ${message}`, { jobId: job.id })
}

export type JobHandler = (job: ClaimedJob, signal: AbortSignal) => Promise<void>

export async function runWorkerOnce(input: {
  repository: JobLeaseRepository
  handler: JobHandler
  workerId: string
  leaseMs: number
}): Promise<'idle' | 'succeeded' | 'retry' | 'dead' | 'cancelled' | 'lost'> {
  const job = await input.repository.claim(input.workerId, input.leaseMs)
  if (!job) return 'idle'

  const abortController = new AbortController()
  const heartbeatMs = Math.max(250, Math.floor(input.leaseMs / 3))
  const timer = setInterval(() => {
    void input.repository.heartbeat(job, input.leaseMs).then((held) => {
      if (!held) abortController.abort(new LeaseLostError())
    }).catch((error) => {
      logBoundedDiagnostic(job, 'heartbeat', error)
      abortController.abort(new LeaseLostError())
    })
  }, heartbeatMs)
  timer.unref?.()

  try {
    try {
      if (!await input.repository.validate(job)) throw new InvalidJobTupleError()
      await input.handler(job, abortController.signal)
    } catch (error) {
      if (error instanceof AnalysisCancelledError) {
        return (await input.repository.cancel(job)) ? 'cancelled' : 'lost'
      }
      logBoundedDiagnostic(job, 'handler', error)
      return await input.repository.retryOrDead(job, classifyFailure(error))
    }

    // Completion failures are not handler failures. Leave the RUNNING row for
    // lease recovery instead of consuming a retry or overwriting terminal state.
    try {
      return (await input.repository.complete(job)) ? 'succeeded' : 'lost'
    } catch (error) {
      logBoundedDiagnostic(job, 'completion', error)
      return 'lost'
    }
  } finally {
    clearInterval(timer)
  }
}

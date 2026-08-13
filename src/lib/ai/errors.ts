import { NoOutputGeneratedError, RetryError } from 'ai'
import { AiBudgetExceededError } from './budget-errors'

export type ModelBoundaryFailureCode =
  | 'AI_INFERENCE_DISABLED'
  | 'AI_CONFIGURATION_ERROR'
  | 'AI_ABORTED'
  | 'AI_TIMEOUT'
  | 'AI_PROVIDER_TRANSIENT'
  | 'AI_PROVIDER_PERMANENT'
  | 'AI_OUTPUT_VALIDATION_FAILED'
  | 'AI_BUDGET_ACCOUNTING_FAILED'

export class ModelBoundaryError extends Error {
  constructor(
    public readonly code: ModelBoundaryFailureCode,
    public readonly transient: boolean,
    safeMessage: string,
  ) {
    super(safeMessage)
    this.name = 'ModelBoundaryError'
  }
}

export type SafeConsumedModelMetadata = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  responseModel?: string
  responseId?: string
  finishReason?: string
}

export class AgentOutputValidationError extends ModelBoundaryError {
  constructor(public readonly consumed?: SafeConsumedModelMetadata) {
    super(
      'AI_OUTPUT_VALIDATION_FAILED',
      false,
      'The model returned output that did not satisfy the required schema.',
    )
    this.name = 'AgentOutputValidationError'
  }
}

export class InferenceDisabledError extends ModelBoundaryError {
  constructor() {
    super('AI_INFERENCE_DISABLED', false, 'Inference is temporarily disabled.')
    this.name = 'InferenceDisabledError'
  }
}

export class ModelConfigurationError extends ModelBoundaryError {
  constructor(message = 'The model execution configuration is unavailable or unsupported.') {
    super('AI_CONFIGURATION_ERROR', false, message)
    this.name = 'ModelConfigurationError'
  }
}

export class BudgetAccountingError extends ModelBoundaryError {
  constructor() {
    super('AI_BUDGET_ACCOUNTING_FAILED', true, 'AI usage accounting could not be finalized.')
    this.name = 'BudgetAccountingError'
  }
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = 'statusCode' in error ? error.statusCode : undefined
  return typeof value === 'number' ? value : undefined
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'TimeoutError') return true
  if (error instanceof Error && error.name === 'TimeoutError') return true
  return RetryError.isInstance(error) && isTimeoutError(error.lastError)
}

export function normalizeModelBoundaryError(error: unknown, signal?: AbortSignal): Error {
  if (error instanceof ModelBoundaryError || error instanceof AiBudgetExceededError) return error
  if (NoOutputGeneratedError.isInstance(error)) return new AgentOutputValidationError()
  if (isTimeoutError(error)) {
    return new ModelBoundaryError('AI_TIMEOUT', true, 'The model request timed out.')
  }

  const name = error instanceof Error ? error.name : ''
  if (signal?.aborted || name === 'AbortError' || (RetryError.isInstance(error) && error.reason === 'abort')) {
    return new ModelBoundaryError('AI_ABORTED', true, 'The model request was aborted.')
  }

  const status = statusCode(error)
  const transient = RetryError.isInstance(error) || status === 408 || status === 429 || Boolean(status && status >= 500)
  return new ModelBoundaryError(
    transient ? 'AI_PROVIDER_TRANSIENT' : 'AI_PROVIDER_PERMANENT',
    transient,
    transient ? 'The model provider is temporarily unavailable.' : 'The model provider rejected the request.',
  )
}

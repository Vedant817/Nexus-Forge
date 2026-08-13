import { InferenceDisabledError } from './errors'

export { InferenceDisabledError }

export function isInferenceEnabled(): boolean {
  return process.env.INFERENCE_DISABLED?.toLowerCase() !== 'true'
}

export function assertInferenceEnabled(): void {
  if (!isInferenceEnabled()) throw new InferenceDisabledError()
}

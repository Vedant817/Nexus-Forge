const MAX_ERROR_MESSAGE_LENGTH = 1_000

export class ApiResponseError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiResponseError'
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error.slice(0, MAX_ERROR_MESSAGE_LENGTH)
  }
  return fallback
}

export async function readApiResponse<T>(response: Response, fallback = 'Request failed.'): Promise<T> {
  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      if (!response.ok) payload = { error: text.slice(0, MAX_ERROR_MESSAGE_LENGTH) }
    }
  }
  if (!response.ok) throw new ApiResponseError(errorMessage(payload, fallback), response.status)
  return payload as T
}

export async function fetchApiJson<T>(input: RequestInfo | URL, init?: RequestInit, fallback?: string): Promise<T> {
  return readApiResponse<T>(await fetch(input, init), fallback)
}

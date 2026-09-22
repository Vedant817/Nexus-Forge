type LogLevel = 'info' | 'warn' | 'error'

function safeMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const allowed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (['requestId', 'projectId', 'runId', 'jobId', 'action', 'status', 'code', 'latencyMs', 'queueDepth', 'queueAgeMs'].includes(key)) {
      allowed[key] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '[OMITTED]'
    }
  }
  return allowed
}

export function logStructured(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message: message.slice(0, 500), ...safeMeta(meta), timestamp: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

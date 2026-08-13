import { createHash } from 'node:crypto'

function canonicalJson(value: unknown, ancestors = new WeakSet<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers.')
    return JSON.stringify(value)
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new TypeError(`Canonical JSON does not support ${typeof value} values.`)
  }
  if (typeof value !== 'object') throw new TypeError('Canonical JSON received an unsupported value.')
  if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support cyclic values.')
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError('Canonical JSON does not support sparse arrays.')
        }
      }
      return `[${value.map((entry) => canonicalJson(entry, ancestors)).join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON supports only plain objects.')
    }
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      throw new TypeError('Canonical JSON does not support symbol keys.')
    }
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length !== ownKeys.length) {
      throw new TypeError('Canonical JSON supports only enumerable data properties.')
    }
    return `{${entries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child, ancestors)}`)
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function executionVersionHash(input: {
  pipelineVersion: string
  promptVersion: string
  modelConfigVersion: string
  modelConfig: unknown
  stages: unknown
}): string {
  return contentHash(input)
}

export function stageInputHash(input: {
  runInputHash: string
  executionVersionHash: string
  stage: string
  dependencyOutputHashes?: Array<string | undefined>
}): string {
  return contentHash({
    runInputHash: input.runInputHash,
    executionVersionHash: input.executionVersionHash,
    stage: input.stage,
    dependencyOutputHashes: (input.dependencyOutputHashes ?? []).map((hash) => hash ?? null),
  })
}

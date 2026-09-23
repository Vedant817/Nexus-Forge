// Minimal CLI for preflight, run, status, cancel, compare, evidence export.
// Usage: npm run cli -- preflight <projectId> | run <projectId> | ...
import 'dotenv/config'
const [command, ...rest] = process.argv.slice(2)
const baseUrl = process.env.NEXUS_FORGE_URL ?? 'http://localhost:3000'
const token = process.env.NEXUS_FORGE_TOKEN ?? ''

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`CLI ${command} failed (${response.status}): ${body.slice(0, 500)}`)
  return body ? JSON.parse(body) : null
}

async function main(): Promise<void> {
  if (!token) throw new Error('Set NEXUS_FORGE_TOKEN to a service-account token.')
  if (command === 'preflight') console.log(JSON.stringify(await call(`/api/projects/${rest[0]}`)))
  else if (command === 'run') console.log(JSON.stringify(await call(`/api/projects/${rest[0]}/run-analysis`, { method: 'POST' })))
  else if (command === 'status') console.log(JSON.stringify(await call(`/api/v1/runs?limit=5`)))
  else if (command === 'evidence') console.log(JSON.stringify(await call(`/api/projects/${rest[0]}/export/evidence-bundle${rest[1] ? `?runId=${rest[1]}` : ''}`)).slice(0, 2000))
  else throw new Error(`Unknown command: ${command}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'CLI failed')
  process.exit(1)
})

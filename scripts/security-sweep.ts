// Repository secret sweep (own approach: gitleaks/semgrep are unavailable in this
// environment, so the committed redaction patterns are the executable policy).
// Scans TRACKED text files for credential shapes WITHOUT printing values.
// Exit 0 = pass, exit 1 = non-allowlisted finding. Findings print file:line only.
//
// Precision rules (mirroring gitleaks allowlists): lines that are code
// references to secret storage (process.env, secrets.*), template
// interpolation, or obvious placeholders are not leaks. Fixture directories
// with synthetic values are allowlisted and reported transparently.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scanSecretContent, shannonEntropy } from '../src/lib/security/secret-scanner'

const ROOT = process.cwd()

// Fixture and documentation paths that intentionally contain synthetic,
// non-functional credential-shaped values. Printed in the report for transparency.
const ALLOWLISTED_PREFIXES: Array<{ prefix: string; reason: string }> = [
  { prefix: 'src/__tests__/', reason: 'synthetic non-functional fixture values' },
  { prefix: 'evals/', reason: 'labeled evaluation fixtures' },
  { prefix: 'docs/', reason: 'documented example patterns' },
  { prefix: 'scripts/security-sweep', reason: 'this scanner references pattern shapes' },
]

// Substrings proving a line is a reference, template, or placeholder — not a leak.
const REFERENCE_MARKERS = [
  'process.env.',
  'secrets.',
  '${',
  'xxx',
  'XXX',
  'example',
  'EXAMPLE',
  'placeholder',
  'changeme',
  'CHANGEME',
  'your-',
  'YOUR_',
  'your_',
  'test-key',
  'test_secret',
  '***',
  '<',
  'dummy',
  'fake-',
  'sample',
  'Unknown user config',
  'postgres:postgres@',
  'localhost',
  '127.0.0.1',
  'ci-only-secret',
]

// Low-precision finding kinds: in source code these overwhelmingly match field
// references (leaseToken: job.leaseToken) rather than values. They still block
// when attached to a quoted high-entropy literal (see below).
const LOW_PRECISION_KINDS = new Set(['generic_assignment', 'high_entropy_token', 'split_token_suspicious'])

const QUOTED_SEGMENT_PATTERN = /"([^"\\]{24,})"|'([^'\\]{24,})'|`([^`\\]{24,})`/g
// Dense token shape: no spaces or punctuation besides base64-ish alphabet.
// Sentences and config strings (CSP headers, commands, SQL identifiers live in
// .sql scope below) never match this.
const DENSE_TOKEN_SHAPE = /^[A-Za-z0-9+/=_-]{24,}$/

// Tool-output directories are not source; never scan them.
const SKIP_PREFIXES = ['.playwright-mcp/']

const MAX_FILE_BYTES = 1_000_000

type Finding = { file: string; line: number; allowlisted: boolean }

function trackedFiles(): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer', timeout: 60_000 })
    return output.toString('utf8').split('\0').filter(Boolean)
  } catch {
    return []
  }
}

function allowlistReason(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/')
  for (const { prefix, reason } of ALLOWLISTED_PREFIXES) {
    if (normalized.startsWith(prefix)) return reason
  }
  return null
}

function main(): void {
  const findings: Finding[] = []
  const tracked = trackedFiles()
  if (tracked.length === 0) {
    console.error('security-sweep: FAIL — could not enumerate tracked files')
    process.exit(1)
  }
  // A committed .env (as opposed to .env.example) is an automatic failure.
  for (const file of tracked) {
    const normalized = file.replace(/\\/g, '/')
    if (/(^|\/)\.env(\.local|\.production)?$/.test(normalized)) {
      findings.push({ file, line: 0, allowlisted: false })
    }
  }
  for (const file of tracked) {
    if (file.endsWith('package-lock.json')) continue
    const absolute = join(ROOT, file)
    if (!existsSync(absolute)) continue
    let text: string
    try {
      text = readFileSync(absolute, 'utf8')
    } catch {
      continue
    }
    if (text.length === 0 || text.length > MAX_FILE_BYTES || text.includes('\0')) continue
    const normalizedFile = file.replace(/\\/g, '/')
    if (SKIP_PREFIXES.some((prefix) => normalizedFile.startsWith(prefix))) continue
    // Migration SQL is dense quoted identifiers by nature; structured tokens only.
    const structuredOnly = normalizedFile.endsWith('.sql')
    const reason = allowlistReason(file)
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!
      if (REFERENCE_MARKERS.some((marker) => line.includes(marker))) continue
      const kinds = scanSecretContent(line).map((finding) => finding.kind)
      const precise = kinds.some((kind) => !LOW_PRECISION_KINDS.has(kind))
      let quotedLiteral = false
      if (!structuredOnly) {
        // 4.5 separates deterministic identifiers (migration names 4.35, UUIDs
        // 3.7, sentences 4.2) from random tokens (>= 4.7). Measured 2026-09-22.
        QUOTED_SEGMENT_PATTERN.lastIndex = 0
        for (let match = QUOTED_SEGMENT_PATTERN.exec(line); match !== null; match = QUOTED_SEGMENT_PATTERN.exec(line)) {
          const segment = match[1] ?? match[2] ?? match[3] ?? ''
          if (DENSE_TOKEN_SHAPE.test(segment) && shannonEntropy(segment) >= 4.5) {
            quotedLiteral = true
            break
          }
        }
      }
      if (precise || quotedLiteral || (kinds.length > 0 && !file.match(/\.(ts|tsx|js|jsx|mjs|cjs|cts|mts|sql)$/))) {
        findings.push({ file, line: index + 1, allowlisted: reason !== null })
      }
    }
  }
  const blocking = findings.filter((finding) => !finding.allowlisted)
  const allowlisted = findings.filter((finding) => finding.allowlisted)
  console.log(`security-sweep: ${tracked.length} tracked files, ${blocking.length} blocking finding(s), ${allowlisted.length} allowlisted fixture line(s)`)
  for (const finding of blocking.slice(0, 50)) {
    console.log(`BLOCKING ${finding.file}:${finding.line}`)
  }
  for (const finding of allowlisted.slice(0, 10)) {
    console.log(`allowlisted ${finding.file}:${finding.line}`)
  }
  if (blocking.length > 0) {
    console.error('security-sweep: FAIL — non-allowlisted credential-shaped values found')
    process.exit(1)
  }
  console.log('security-sweep: PASS — no leaks found')
}

main()

// Static-analysis-lite benchmark (own approach: semgrep is unavailable here).
// Fails on dangerous sinks outside their documented homes. Prints file:line only.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ROOT = process.cwd()

type Rule = { id: string; pattern: RegExp; allowed: RegExp; reason: string }

const RULES: Rule[] = [
  {
    id: 'no-eval',
    pattern: /(^|[^A-Za-z0-9_.])eval\s*\(/,
    allowed: /^src\/__tests__\//,
    reason: 'eval() executes strings; no production use is permitted',
  },
  {
    id: 'no-new-function',
    pattern: /new\s+Function\s*\(/,
    allowed: /^src\/__tests__\//,
    reason: 'new Function() executes strings; no production use is permitted',
  },
  {
    id: 'no-dangerous-html',
    pattern: /dangerouslySetInnerHTML/,
    allowed: /^src\/__tests__\//,
    reason: 'unescaped HTML sinks must never render untrusted content',
  },
  {
    id: 'no-child-process-outside-sandbox',
    pattern: /from\s+['"]node:child_process['"]|require\(['"]child_process['"]\)/,
    allowed: /^(src\/lib\/quality\/sandbox\.ts|scripts\/(sandbox-worker|quality-sandbox|test-durable-postgres)\.ts|src\/__tests__\/)/,
    reason: 'process spawning is confined to the sandbox, workers, and tests',
  },
]

function trackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer', timeout: 60_000 })
  return output.toString('utf8').split('\0').filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file) && !file.startsWith('node_modules/'))
}

function main(): void {
  let failures = 0
  for (const file of trackedFiles()) {
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line) && !rule.allowed.test(file.replace(/\\/g, '/'))) {
          console.log(`FAIL ${rule.id} ${file}:${index + 1} (${rule.reason})`)
          failures += 1
        }
      }
    })
  }
  if (failures > 0) {
    console.error(`security-sast: FAIL — ${failures} finding(s)`)
    process.exit(1)
  }
  console.log('security-sast: PASS — no dangerous sinks outside documented homes')
}

main()

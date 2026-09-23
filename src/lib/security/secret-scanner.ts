import { checkObfuscatedInjection, checkPromptInjection } from './prompt-injection-guard'

export const SECRET_SCANNER_VERSION = 'secret-scanner-v1'

export type SecretFinding = {
  kind: string
  severity: 'high' | 'medium'
  path?: string
  line?: number
  scannerVersion: string
}

const STRUCTURED_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
  { kind: 'database_url', pattern: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis(?:s)?):\/\/[^\s/:]+:[^\s@/]+@/i },
  { kind: 'slack_webhook', pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9_-]+/ },
  { kind: 'github_token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/ },
  { kind: 'github_pat', pattern: /github_pat_[A-Za-z0-9_]{36,}/ },
  { kind: 'groq_key', pattern: /gsk_[A-Za-z0-9_-]{20,}/ },
  { kind: 'openai_project_key', pattern: /sk-proj-[A-Za-z0-9_-]{20,}/ },
  { kind: 'anthropic_key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'openai_key', pattern: /sk-[A-Za-z0-9]{32,}/ },
  { kind: 'google_key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { kind: 'gitlab_token', pattern: /glpat-[A-Za-z0-9_-]{20,}/ },
  { kind: 'npm_token', pattern: /npm_[A-Za-z0-9]{30,}/ },
  { kind: 'npm_authtoken', pattern: /\/\/registry\.npmjs\.org\/:_authToken\s*=\s*[^\s'";]+/i },
  { kind: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { kind: 'aws_secret_key', pattern: /aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}/i },
  { kind: 'heroku_key', pattern: /heroku[a-f0-9]{32}/i },
  { kind: 'sendgrid_key', pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  { kind: 'discord_webhook', pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/ },
  { kind: 'stripe_live_key', pattern: /(?:pk|sk)_live_[A-Za-z0-9]{24,}/ },
  { kind: 'stripe_test_key', pattern: /sk_test_[A-Za-z0-9]{24,}/ },
  { kind: 'slack_token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'aws_access_key', pattern: /AKIA[0-9A-Z]{16}/ },
  { kind: 'generic_assignment', pattern: /(?:api[-_]?key|apikey|client[-_]?secret|access[-_]?token|auth[-_]?token|secret|token|password|passwd|private[-_]?key|database[-_]?url|db[-_]?url)\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s,;]{12,})/i },
]

const HIGH_RISK_PATH_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)\.env\.(local|production|development).*$/i,
  /(^|\/)\.aws\//i,
  /(^|\/)\.ssh\//i,
  /(^|\/)(secrets?|credentials?|private_keys?)\//i,
  /id_rsa/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.docker\/config\.json$/i,
  /(^|\/)kube\/config$/i,
]

export function isHighRiskPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return HIGH_RISK_PATH_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function isExcludedPath(path: string, excludedPaths: string[] = []): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '')
  return excludedPaths.some((exclusion) => {
    const clean = exclusion.trim().replace(/^\.\//, '').replace(/\/+$/, '')
    if (!clean) return false
    return normalized === clean || normalized.startsWith(`${clean}/`)
  })
}

export function shannonEntropy(value: string): number {
  if (!value) return 0
  const counts = new Map<string, number>()
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1)
  let entropy = 0
  for (const count of counts.values()) {
    const p = count / value.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

// `=` is excluded from the token body (base64 padding only trails) so that
// `NAME=value` pairs cannot fuse into one high-entropy "token".
const ENTROPY_TOKEN_PATTERN = /[A-Za-z0-9_\-+/]{20,}={0,2}/g

export function scanSecretContent(content: string, path?: string): SecretFinding[] {
  const findings: SecretFinding[] = []
  if (path && isHighRiskPath(path)) {
    findings.push({ kind: 'high_risk_path', severity: 'medium', path, scannerVersion: SECRET_SCANNER_VERSION })
  }
  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const { kind } of STRUCTURED_PATTERNS) {
      // Re-test per line to get line numbers without storing values.
      const entry = STRUCTURED_PATTERNS.find((candidate) => candidate.kind === kind)!
      // Reset lastIndex for global patterns by constructing a non-global test.
      const source = entry.pattern.source
      const flags = entry.pattern.flags.replace('g', '')
      if (new RegExp(source, flags).test(line)) {
        findings.push({ kind, severity: 'high', path, line: index + 1, scannerVersion: SECRET_SCANNER_VERSION })
        break
      }
    }
    // High-entropy fallback for unknown credential-like tokens.
    const candidates = line.match(ENTROPY_TOKEN_PATTERN) ?? []
    for (const candidate of candidates) {
      const stripped = candidate.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
      if (stripped.length < 24) continue
      if (shannonEntropy(stripped) >= 4.2) {
        findings.push({ kind: 'high_entropy_token', severity: 'medium', path, line: index + 1, scannerVersion: SECRET_SCANNER_VERSION })
        break
      }
    }
    // Split-token bypass: a credential keyword joined to a value by concatenation
    // operators reconstructs a live secret at runtime/LLM-read time, so it blocks.
    if (/secret|token|password|passwd|api[_-]?key/i.test(line) && /(\+|concat|join|join\(|\|\||&&)/.test(line)) {
      findings.push({ kind: 'split_token_suspicious', severity: 'high', path, line: index + 1, scannerVersion: SECRET_SCANNER_VERSION })
    }
  })
  // Cross-line chunking: a structured token split across line breaks matches
  // nothing per-line. Re-scan newline-joined text for structured shapes only
  // (never entropy — fused prose would false-positive).
  if (content.includes('\n')) {
    const joined = content.split(/\r?\n/).join('')
    for (const { kind, pattern } of STRUCTURED_PATTERNS) {
      const source = pattern.source
      const flags = pattern.flags.replace('g', '')
      if (new RegExp(source, flags).test(joined) && !findings.some((finding) => finding.kind === kind)) {
        findings.push({ kind: `${kind}:multiline`, severity: 'high', path, scannerVersion: SECRET_SCANNER_VERSION })
      }
    }
  }
  // Deduplicate by kind+line to keep output bounded.
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.kind}:${finding.line ?? 0}:${finding.path ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 50)
}

export function hasBlockingFinding(findings: SecretFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'high' || finding.kind === 'high_risk_path' || finding.kind === 'high_entropy_token')
}

export type UntrustedContentAssessment = {
  findings: SecretFinding[]
  injectionSeverity: 'none' | 'low' | 'medium' | 'high'
  injectionPatterns: string[]
  quarantined: boolean
  reasons: string[]
}

/**
 * Single enforcement point for untrusted text: secrets and high-severity
 * prompt injection both quarantine. Used at intake and re-checked at enqueue
 * so rows stored before enforcement cannot reach the model.
 */
export function assessUntrustedContent(content: string, path?: string): UntrustedContentAssessment {
  const findings = scanSecretContent(content, path)
  const injection = checkPromptInjection(content)
  const injectionBlocked = injection.severity === 'high'
  const obfuscated = checkObfuscatedInjection(content)
  const quarantined = hasBlockingFinding(findings) || injectionBlocked || obfuscated.detected
  return {
    findings,
    injectionSeverity: obfuscated.detected ? 'high' : injection.severity,
    injectionPatterns: obfuscated.detected ? obfuscated.matchedPatterns : injection.matchedPatterns,
    quarantined,
    reasons: [
      ...new Set(findings.map((finding) => finding.kind)),
      ...(injectionBlocked ? [`prompt-injection:${injection.matchedPatterns.slice(0, 3).join('|')}`] : []),
      ...(obfuscated.detected ? [`prompt-injection:obfuscated:${obfuscated.matchedPatterns.slice(0, 3).join('|')}`] : []),
    ],
  }
}

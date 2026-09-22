const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis(?:s)?):\/\/[^\s/:]+:[^\s@/]+@[^\s'"<>]+/gi,
  /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9_-]+/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{36,}/g,
  /gsk_[A-Za-z0-9_-]{20,}/g,
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9]{32,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /glpat-[A-Za-z0-9_-]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /\/\/registry\.npmjs\.org\/:_authToken\s*=\s*[^\s'";]+/gi,
  /aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}/gi,
  /heroku[a-f0-9]{32}/gi,
  /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(?:pk|sk)_live_[A-Za-z0-9]{24,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?:api[-_]?key|apikey|client[-_]?secret|access[-_]?token|auth[-_]?token|secret|token|password|passwd|private[-_]?key|database[-_]?url|db[-_]?url)\s*[:=]\s*(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s,;]{12,})/gi,
]

const REDACTED = '[REDACTED]'

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, REDACTED)
  return result
}

export function redactStructuredValue<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as T
  if (Array.isArray(value)) return value.map((entry) => redactStructuredValue(entry)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactStructuredValue(entry)]),
    ) as T
  }
  return value
}

export function isPotentialSecret(value: string): boolean {
  return redactSecrets(value) !== value
}

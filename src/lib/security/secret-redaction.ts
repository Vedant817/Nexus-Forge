const SECRET_PATTERNS = [
  /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/g,
  /sk-[a-zA-Z0-9]{32,}/g,
  /(?:api[-_]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi,
  /(?:secret|token|password|private_key)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi,
  /(?:ghp|github_pat)_[a-zA-Z0-9_]{36,}/g,
  /pk_live_[a-zA-Z0-9]{24,}/g,
  /sk_live_[a-zA-Z0-9]{24,}/g,
  /AKIA[0-9A-Z]{16}/g,
]

const REDACTED = '[REDACTED]'

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED)
  }
  return result
}

export function isPotentialSecret(value: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return true
    }
  }
  return false
}

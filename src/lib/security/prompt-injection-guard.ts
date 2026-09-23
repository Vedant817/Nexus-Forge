export interface InjectionCheckResult {
  suspicious: boolean
  matchedPatterns: string[]
  severity: 'none' | 'low' | 'medium' | 'high'
}

const patternDescriptions: { pattern: RegExp; description: string }[] = [
  { pattern: /\bignore\s+(all\s+)?previous\s+instructions\b/i, description: 'Ignore previous instructions' },
  { pattern: /\bignore\s+(all\s+)?prior\s+instructions\b/i, description: 'Ignore prior instructions' },
  { pattern: /\bdisregard\s+(all\s+)?(previous|prior)\s+(instructions|commands)\b/i, description: 'Disregard previous instructions' },
  { pattern: /\breveal\s+(your\s+)?(secrets?|prompts?|instructions?|system\s+prompt|environment)/i, description: 'Reveal secrets/prompts' },
  { pattern: /\bprint\s+(your\s+)?(secrets?|prompts?|token|password|key|environment)/i, description: 'Print secrets' },
  { pattern: /\boutput\s+(your\s+)?(secrets?|prompts?|token|password|key|environment)/i, description: 'Output secrets' },
  { pattern: /\bshow\s+(your\s+)?(secrets?|prompts?|system\s+prompt)/i, description: 'Show secrets' },
  { pattern: /\bdisable\s+(all\s+)?(security|safety|restrictions?|filter|moderation)/i, description: 'Disable security' },
  { pattern: /\bbypass\s+(all\s+)?(security|safety|restrictions?|filter|moderation)/i, description: 'Bypass security' },
  { pattern: /\baccess\s+(environmental?\s+variables?|env|process\.env)/i, description: 'Access environment variables' },
  { pattern: /\b(execute|run|call)\s+(shell|command|system|terminal|bash|cmd|powershell)/i, description: 'Execute commands' },
  { pattern: /\bdownload\s+(and\s+)?(execute|run)\b/i, description: 'Download and execute' },
  { pattern: /\bcurl\s+(http|https):/i, description: 'External URL call via curl' },
  { pattern: /\bwget\s+(http|https):/i, description: 'External URL call via wget' },
  { pattern: /\bfetch\s+['\"](http|https):/i, description: 'External URL call via fetch' },
  { pattern: /\b(leak|exfiltrate|send|post)\s+(to|data|my|the)\s+(http|https|server|url)/i, description: 'Data exfiltration attempt' },
  { pattern: /\byou\s+(are\s+)?(now|will\s+act\s+as|are\s+released\s+from|have\s+been\s+unlocked)/i, description: 'Role override attempt' },
  { pattern: /\bnew\s+instructions?\s*:\s*/i, description: 'New instructions delimiter' },
  { pattern: /\boverride\s+(mode|instructions|prompt|settings)/i, description: 'Override instructions' },
]

export function checkPromptInjection(content: string): InjectionCheckResult {
  const matchedPatterns: string[] = []

  for (const { pattern, description } of patternDescriptions) {
    if (pattern.test(content)) {
      matchedPatterns.push(description)
    }
  }

  if (matchedPatterns.length === 0) {
    return { suspicious: false, matchedPatterns: [], severity: 'none' }
  }

  const severity: InjectionCheckResult['severity'] =
    matchedPatterns.length >= 3 ? 'high' : matchedPatterns.length >= 2 ? 'medium' : 'low'

  return { suspicious: true, matchedPatterns, severity }
}

const BASE64_RUN_PATTERN = /[A-Za-z0-9+/]{64,}={0,2}/g

// Compact shapes that survive whitespace-stripping obfuscation
// ("i g n o r e ..." or "ignorepreviousinstructions").
const SQUASHED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /ignore(all)?(previous|prior)instructions/, description: 'Ignore previous instructions (obfuscated)' },
  { pattern: /reveal(your)?(secrets?|prompts?|systemprompt)/, description: 'Reveal secrets/prompts (obfuscated)' },
  { pattern: /disab(le|ling)(allsafety|safety|security|allsecurity)/, description: 'Disable safety (obfuscated)' },
  { pattern: /bypass(allsafety|safety|allsecurity|security)/, description: 'Bypass safety (obfuscated)' },
  { pattern: /(output|print)(your)?secrets/, description: 'Output secrets (obfuscated)' },
  { pattern: /exfiltrate|sendtoserver/, description: 'Exfiltration (obfuscated)' },
]

function tryBase64Decode(run: string): string | null {
  try {
    const text = Buffer.from(run, 'base64').toString('utf8')
    // Decoded output must be mostly printable text to be worth checking.
    if (!text || /[�\0]/.test(text)) return null
    return text
  } catch {
    return null
  }
}

export interface ObfuscatedInjectionResult {
  detected: boolean
  matchedPatterns: string[]
}

/**
 * Catches whitespace-stripped and base64-wrapped instruction smuggling that
 * word-boundary regexes miss. Conservative by design: base64 runs must decode
 * to printable text that itself scores high, and squashed text needs >= 2
 * distinct compact shapes.
 */
export function checkObfuscatedInjection(content: string): ObfuscatedInjectionResult {
  const matched: string[] = []

  const squashed = content.replace(/\s+/g, '').toLowerCase()
  if (squashed.length >= 20) {
    const squashedHits = SQUASHED_PATTERNS.filter(({ pattern }) => pattern.test(squashed)).map(({ description }) => description)
    if (squashedHits.length >= 2) matched.push(...squashedHits)
  }

  BASE64_RUN_PATTERN.lastIndex = 0
  for (let match = BASE64_RUN_PATTERN.exec(content); match !== null; match = BASE64_RUN_PATTERN.exec(content)) {
    const decoded = tryBase64Decode(match[0])
    if (decoded && checkPromptInjection(decoded).severity === 'high') {
      matched.push('Base64-wrapped instructions')
      break
    }
  }

  return { detected: matched.length > 0, matchedPatterns: [...new Set(matched)] }
}

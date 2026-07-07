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

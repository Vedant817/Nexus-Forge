import type { KnowledgeDistillerInput, KnowledgeDistillerOutput } from '@/types'
import { checkPromptInjection } from '@/lib/security/prompt-injection-guard'
import { redactSecrets } from '@/lib/security/secret-redaction'

export async function knowledgeDistiller(input: KnowledgeDistillerInput): Promise<KnowledgeDistillerOutput> {
  const allContent = input.sources.map(s => s.content).join('\n\n')
  const redacted = redactSecrets(allContent)
  const injectionCheck = checkPromptInjection(redacted)

  const warnings: string[] = []
  if (injectionCheck.suspicious) {
    warnings.push(`Suspicious patterns detected in source content: ${injectionCheck.matchedPatterns.join(', ')}`)
  }

  const topics = extractTopics(redacted)
  const concepts = extractConcepts(redacted)
  const patterns = extractPatterns(redacted)
  const tasks = extractBuildableTasks(redacted, input.sources)
  const terms = extractTerms(redacted)

  if (redacted.length < 100) {
    warnings.push('Source content is very short. Analysis may lack depth.')
  }

  return {
    mainTopic: topics[0] || 'Unknown',
    keyConcepts: concepts,
    implementationPatterns: patterns,
    buildableTasks: tasks,
    warningsOrPitfalls: warnings,
    termsToUnderstand: terms,
    sourceEvidence: input.sources.map(s => `[${s.type}] ${s.title || 'Untitled'}`),
    recommendedNextAction: tasks.length > 0
      ? `Start with task: ${tasks[0].title}`
      : 'Review source content and try adding more detail.',
  }
}

function extractTopics(content: string): string[] {
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  const headingLines = lines.filter(l => /^#{1,3}\s/.test(l) || (l.length > 10 && l.length < 100 && !l.endsWith('.') && !l.endsWith('?')))
  if (headingLines.length > 0) {
    return headingLines.slice(0, 3).map(l => l.replace(/^#+\s*/, '').trim())
  }
  const firstSentences = content.match(/^[A-Z][^.!?\n]{10,90}/m)
  if (firstSentences) {
    return [firstSentences[0].trim()]
  }
  return ['Extracted from source content']
}

function extractConcepts(content: string): string[] {
  const sentences = content.match(/[^.!?\n]+[.!?]/g) || []
  const technicalTerms: string[] = []

  const conceptPatterns = [
    /(?:API|function|class|method|library|framework|tool|system|protocol|database|cache|queue|service|module|component|hook|state|props|config|endpoint|algorithm|pattern|pipeline|middleware|integration|deployment|authentication|authorization|encryption|caching|indexing|migration|scalability|observability|monitoring|logging|testing).{0,60}/i,
    /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g,
    /`[a-zA-Z0-9_-]+`/g,
  ]

  for (const pattern of conceptPatterns) {
    const matches = content.match(pattern)
    if (matches) {
      for (const m of matches) {
        const cleaned = m.replace(/[`"']/g, '').trim()
        if (cleaned.length > 3 && !technicalTerms.includes(cleaned)) {
          technicalTerms.push(cleaned.slice(0, 120))
        }
      }
    }
  }

  for (const s of sentences) {
    if (/concept|approach|technique|methodology|paradigm|architecture/i.test(s)) {
      const trimmed = s.trim().slice(0, 120)
      if (!technicalTerms.includes(trimmed)) technicalTerms.push(trimmed)
    }
  }

  if (technicalTerms.length === 0) {
    const words = content.split(/\s+/).filter(w => w.length > 8 && /^[A-Z]/.test(w)).slice(0, 5)
    return words.length > 0 ? words : ['No specific technical concepts identified']
  }
  return technicalTerms.slice(0, 10)
}

function extractPatterns(content: string): string[] {
  const patterns: string[] = []
  const lower = content.toLowerCase()

  if (lower.includes('pattern') || lower.includes('design pattern')) {
    patterns.push('Design patterns referenced in source')
  }
  if (lower.includes('architecture') || lower.includes('architect')) {
    patterns.push('Architecture approach discussed')
  }
  if (lower.includes('api') || lower.includes('endpoint')) {
    patterns.push('API design patterns implied')
  }
  if (lower.includes('component') || lower.includes('component-based')) {
    patterns.push('Component-based architecture')
  }
  if (lower.includes('hook') || lower.includes('usestate') || lower.includes('useeffect')) {
    patterns.push('React hooks pattern')
  }
  if (lower.includes('middleware') || lower.includes('middleware')) {
    patterns.push('Middleware pattern')
  }
  if (lower.includes('pipeline') || lower.includes('pipe')) {
    patterns.push('Pipeline/chain of responsibility')
  }

  if (patterns.length === 0) {
    patterns.push('No explicit implementation patterns identified from source')
  }

  return patterns
}

function extractBuildableTasks(
  content: string,
  sources: { type: string; title: string; content: string }[]
): { title: string; description: string; evidence: string }[] {
  const tasks: { title: string; description: string; evidence: string }[] = []
  const lines = content.split('\n')
  const lower = content.toLowerCase()

  const taskIndicators = ['build', 'create', 'implement', 'add', 'set up', 'configure', 'install', 'deploy', 'test', 'write', 'develop', 'integrate', 'refactor', 'migrate', 'extract', 'optimize']

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 15 && trimmed.length < 250) {
      const matched = taskIndicators.find(i => {
        const pattern = new RegExp(`^${i}\\b|\\b${i}\\b`, 'i')
        return pattern.test(trimmed)
      })
      if (matched) {
        const title = trimmed.replace(/^[-*\d.\s]+/, '').slice(0, 70).replace(/[.:;]$/, '')
        if (!tasks.some(t => t.title === title)) {
          tasks.push({
            title,
            description: trimmed.slice(0, 250),
            evidence: `Extracted from source: "${trimmed.slice(0, 120)}..."`,
          })
        }
      }
    }
  }

  if (tasks.length === 0 && content.length > 50) {
    const sourceInfo = sources.map(s => s.type).join(', ')
    tasks.push({
      title: 'Apply source concepts to project',
      description: `Review and implement the concepts and patterns identified from ${sources.length} source(s) (${sourceInfo}).`,
      evidence: `Based on ${sources.length} source(s) totaling ${content.length} characters`,
    })
    if (content.length > 200) {
      tasks.push({
        title: 'Set up project infrastructure',
        description: 'Configure the development environment, dependencies, and tooling based on the technical requirements implied by the source content.',
        evidence: `Project setup required based on ${sources.length} learning source(s)`,
      })
    }
  }

  return tasks.slice(0, 10)
}

function extractTerms(content: string): string[] {
  const terms = content.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || []
  const unique = [...new Set(terms)].slice(0, 8)
  if (unique.length === 0) {
    const technical = content.match(/\b(?:API|SDK|CLI|IDE|DOM|CSS|HTML|JSON|YAML|SQL|NoSQL|REST|GraphQL|gRPC|WebSocket|OAuth|JWT)\b/gi)
    if (technical) return [...new Set(technical.map(t => t.toUpperCase()))]
  }
  return unique
}

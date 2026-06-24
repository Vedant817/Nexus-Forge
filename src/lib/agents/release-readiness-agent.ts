import type { ReleaseReadinessInput, ReleaseReadinessOutput } from '@/types'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { computeReleaseScore } from '@/lib/scoring/scoring'

export async function releaseReadinessAgent(input: ReleaseReadinessInput): Promise<ReleaseReadinessOutput> {
  const risks: string[] = []
  const missingTests: string[] = []
  const missingDocs: string[] = []
  const configIssues: string[] = []
  const backwardCompatConcerns: string[] = []
  const checklist: string[] = []
  const fixes: string[] = []

  if (input.prDiff) {
    const redactedDiff = redactSecrets(input.prDiff)
    const diffLower = redactedDiff.toLowerCase()

    if (redactedDiff !== input.prDiff) {
      risks.push('Potential secrets or tokens detected in diff')
      checklist.push('Verify no secrets committed')
      fixes.push('Remove hardcoded secrets from diff')
    }

    const hardcodedValues = redactedDiff.match(/(?:api_key|apiKey|password|secret|token)\s*[=:]\s*['"][^'"]+['"]/gi)
    if (hardcodedValues) {
      risks.push(`Hardcoded values found: ${hardcodedValues.length} instance(s)`)
      checklist.push('Move hardcoded values to environment variables')
      fixes.push('Replace hardcoded values with environment variables')
    }

    if (/console\.log/.test(redactedDiff)) {
      risks.push('Console.log statements in changed code')
      checklist.push('Remove debug console.log statements')
      fixes.push('Remove console.log statements from production code')
    }

    if (/TODO|FIXME|HACK|XXX/.test(redactedDiff)) {
      risks.push('TODO/FIXME/HACK markers in changed code')
      checklist.push('Address TODO/FIXME items before merge')
      fixes.push('Resolve TODO/FIXME markers')
    }

    if (/@ts-ignore|@ts-nocheck|@ts-expect-error/.test(redactedDiff)) {
      risks.push('TypeScript type checking disabled in parts of the diff')
      checklist.push('Remove @ts-ignore/@ts-nocheck directives')
      fixes.push('Fix type issues instead of ignoring them')
    }

    const breakingPatterns = [
      { pattern: /^export\s+(default\s+)?(function|class|interface|type|const)\s+\w+/m, label: 'New public API export added' },
      { pattern: /^\+\s*(import|export)\s+.*\bfrom\b/m, label: 'Module dependency changed' },
      { pattern: /^\+\s*".*":\s*".*"/m, label: 'Configuration values changed' },
      { pattern: /-\s*(function|const|let|var)\s+\w+\s*[=(]/m, label: 'Removed or renamed function/variable' },
    ]

    for (const { pattern, label } of breakingPatterns) {
      const removedMatches = redactedDiff.match(new RegExp(pattern.source.replace('^\\+', '^-').replace('^\\+\\s*', '^-\\s*'), 'm'))
      const addedMatches = redactedDiff.match(pattern)
      if (removedMatches && addedMatches) {
        backwardCompatConcerns.push(`${label} — potential breaking change detected`)
      }
    }

    if (diffLower.includes('deprecat')) {
      backwardCompatConcerns.push('Deprecation notices found in diff — check for removed functionality')
    }

    if (diffLower.includes('rename') || diffLower.includes('renamed')) {
      backwardCompatConcerns.push('Renamed entities detected — verify consumers are updated')
    }

    if (redactedDiff.match(/^\+.*(?:delete|drop|remove|rename)\s+(?:table|column|field|collection)/im)) {
      backwardCompatConcerns.push('Database schema changes detected — migration required')
    }

    if (redactedDiff.match(/^\+.*(?:process\.env\.|process\.env\[)/im)) {
      configIssues.push('New environment variable(s) referenced — document in .env.example')
    }
  }

  if (input.changedFiles) {
    const hasTestChanges = input.changedFiles.some(f => /test|spec|__tests__/.test(f))
    if (!hasTestChanges && input.changedFiles.length > 0) {
      missingTests.push('No test files changed alongside implementation')
      checklist.push('Add tests for changed files')
      fixes.push('Write tests covering the changes')
    }

    const configFiles = input.changedFiles.filter(f => /config|\.env|docker-compose|package\.json/i.test(f))
    if (configFiles.length > 0) {
      checklist.push('Review configuration file changes')
    }
  }

  if (input.repoAnalysis) {
    const analysis = input.repoAnalysis
    if (analysis.missingItems.includes('README.md')) {
      missingDocs.push('README.md is missing')
      checklist.push('Create README.md')
    }
    if (analysis.missingItems.includes('.env.example')) {
      configIssues.push('No .env.example file')
      checklist.push('Create .env.example')
    }
    if (analysis.missingItems.includes('Dockerfile')) {
      configIssues.push('No Dockerfile for containerized deployment')
    }
  }

  checklist.push('Code reviewed', 'Tests passing', 'No hardcoded secrets', 'Documentation updated', 'CHANGELOG updated')

  const hasTestEvidence = missingTests.length === 0
  const docsUpdated = missingDocs.length === 0
  const configSafe = configIssues.length === 0
  const backwardCompatible = backwardCompatConcerns.length === 0

  const scoreResult = computeReleaseScore({
    hasTestEvidence,
    riskCount: risks.length,
    docsUpdated,
    configSafe,
    backwardCompatible,
  })

  const score = scoreResult.score
  const decision: ReleaseReadinessOutput['decision'] = score >= 80 ? 'go' : score >= 50 ? 'go_with_fixes' : 'no_go'

  return {
    releaseScore: score,
    decision,
    topRisks: risks,
    missingTests,
    missingDocs,
    configOrEnvIssues: configIssues,
    backwardCompatibilityConcerns: backwardCompatConcerns,
    releaseChecklist: [...new Set(checklist)],
    releaseNotesDraft: generateReleaseNotes(input),
    recommendedFixesBeforeMerge: [...new Set(fixes)],
  }
}

function generateReleaseNotes(input: ReleaseReadinessInput): string {
  const date = new Date().toISOString().split('T')[0]
  const changes = input.changedFiles ? input.changedFiles.length : 'several'
  return `## Release ${date}\n\n### Changes\n- ${changes} file(s) changed\n\n### Notes\n- ${input.prDiff ? 'Code changes requiring review' : 'Release pending code review'}\n\n### Checklist\n- [ ] Code reviewed\n- [ ] Tests passing\n- [ ] No hardcoded secrets\n- [ ] Documentation updated`
}

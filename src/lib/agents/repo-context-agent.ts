import type { RepoContextAgentInput, RepoContextAgentOutput } from '@/types'
import { computeRepoMaturityScore } from '@/lib/scoring/scoring'

export async function repoContextAgent(input: RepoContextAgentInput): Promise<RepoContextAgentOutput> {
  const detectedStack = detectStack(input)
  const hasReadme = !!input.readme && input.readme.length > 50
  const hasTests = findTestLocations(input).length > 0
  const hasEnvExample = !!input.envExample
  const hasDocker = !!input.dockerfile
  const hasCI = !!(input.githubWorkflows && input.githubWorkflows.length > 0)
  const hasPackageConfig = !!(input.packageJson || input.requirementsTxt || input.pyprojectToml)

  const missingItemsSet = findMissingItems(input)
  const foundRisks = findRisks(input, detectedStack)

  const scoreResult = computeRepoMaturityScore({
    hasReadme,
    readmeLength: input.readme?.length || 0,
    hasTests,
    hasEnvExample,
    hasDocker,
    hasCI,
    hasPackageConfig,
    missingCount: missingItemsSet.length,
  })

  const importantFiles = findImportantFiles(input)
  const testLocations = findTestLocations(input)
  const recommendedFixes = [...scoreResult.recommendedFixes]

  const allRisks = [...scoreResult.reasons.map(r => ({ reason: r })), ...foundRisks.map(r => ({ reason: r }))]
    .filter((v, i, a) => a.findIndex(x => x.reason === v.reason) === i)
    .map(x => x.reason)

  return {
    detectedStack,
    architectureSummary: generateArchSummary(input, detectedStack),
    importantFiles,
    likelyFeatureLocations: importantFiles.filter(f => !f.includes('test') && !f.includes('config')),
    testLocations,
    setupQuality: input.packageJson ? 'Has package.json with project setup' : input.requirementsTxt ? 'Has requirements.txt' : 'No setup file detected',
    missingItems: missingItemsSet,
    risks: allRisks,
    maturityScore: scoreResult.score,
    recommendedFixes,
  }
}

function detectStack(input: RepoContextAgentInput): string[] {
  const stack: string[] = []
  if (!input.packageJson && !input.requirementsTxt && !input.pyprojectToml) {
    return ['Unknown - no dependency file found']
  }

  if (input.packageJson) {
    try {
      const pkg = JSON.parse(input.packageJson)
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }

      if (deps.next) stack.push('Next.js')
      if (deps.react) stack.push('React')
      if (deps['@prisma/client'] || deps.prisma) stack.push('Prisma')
      if (deps['@lemonsqueezy/lemma'] || deps.lemma) stack.push('Lemma SDK')
      if (deps.express) stack.push('Express')
      if (deps.fastify) stack.push('Fastify')
      if (deps.tailwindcss) stack.push('Tailwind CSS')
      if (deps.typescript) stack.push('TypeScript')

      if (stack.length === 0) {
        if (deps.react) stack.push('React')
        else stack.push('Node.js')
      }
    } catch {
      stack.push('Node.js (package.json found but unparseable)')
    }
  }

  if (input.requirementsTxt) {
    stack.push('Python')
    if (input.requirementsTxt.includes('django') || input.requirementsTxt.includes('Django')) stack.push('Django')
    if (input.requirementsTxt.includes('flask') || input.requirementsTxt.includes('Flask')) stack.push('Flask')
    if (input.requirementsTxt.includes('fastapi') || input.requirementsTxt.includes('FastAPI')) stack.push('FastAPI')
  }

  if (input.pyprojectToml) {
    stack.push('Python (pyproject.toml)')
  }

  return [...new Set(stack)]
}

function findMissingItems(input: RepoContextAgentInput): string[] {
  const missing: string[] = []
  if (!input.readme || input.readme.length < 50) missing.push('README.md')
  if (!input.envExample) missing.push('.env.example')
  if (!input.dockerfile) missing.push('Dockerfile')
  if (!input.dockerCompose) missing.push('docker-compose.yml')
  if (!input.githubWorkflows || input.githubWorkflows.length === 0) missing.push('CI/CD workflow (.github/workflows)')
  return missing
}

function findRisks(input: RepoContextAgentInput, stack: string[]): string[] {
  const risks: string[] = []
  if (stack.includes('Unknown - no dependency file found')) {
    risks.push('No dependency/package file found - cannot determine project structure')
  }
  if (!input.readme || input.readme.length < 50) {
    risks.push('No README - project documentation is missing, making onboarding difficult')
  }
  if (!input.envExample) {
    risks.push('No .env.example - environment configuration is not documented')
  }
  return risks
}

function findImportantFiles(input: RepoContextAgentInput): string[] {
  const files: string[] = []
  if (input.packageJson) files.push('package.json')
  if (input.requirementsTxt) files.push('requirements.txt')
  if (input.pyprojectToml) files.push('pyproject.toml')
  if (input.dockerfile) files.push('Dockerfile')
  if (input.dockerCompose) files.push('docker-compose.yml')
  if (input.envExample) files.push('.env.example')
  if (input.githubWorkflows) files.push(...input.githubWorkflows.map(w => `.github/workflows/${w}`))
  return files
}

function findTestLocations(input: RepoContextAgentInput): string[] {
  const locations: string[] = []
  if (input.folderTree) {
    const tree = input.folderTree.toLowerCase()
    if (tree.includes('test') || tree.includes('tests')) locations.push('test/ or tests/ directory detected')
    if (tree.includes('__tests__')) locations.push('__tests__ directory detected')
    if (tree.includes('spec')) locations.push('spec/ directory detected')
    if (tree.includes('jest')) locations.push('Jest configuration detected')
    if (tree.includes('vitest')) locations.push('Vitest configuration detected')
  }
  return locations
}

function generateArchSummary(input: RepoContextAgentInput, stack: string[]): string {
  if (stack.length === 0) return 'No architecture information available'
  return `Stack: ${stack.join(', ')}. ${input.readme ? 'README provides project overview.' : 'No README available.'}`
}

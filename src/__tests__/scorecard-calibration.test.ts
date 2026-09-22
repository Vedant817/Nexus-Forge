import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluateScorecard } from '@/lib/evidence/evaluate'
import { collectRunEvidence } from '@/lib/evidence/collectors'

describe('scorecard calibration and regression', () => {
  it('passes the fixed v1 evaluation fixtures without implying prediction', () => {
    const fixtures = JSON.parse(readFileSync(new URL('../../evals/scorecards/v1/fixtures.json', import.meta.url), 'utf8'))
    expect(fixtures.version).toBe('evidence-scorecards-v1')
    expect(fixtures.interRaterAgreement).toBeGreaterThanOrEqual(0.8)
    const evidence = collectRunEvidence({
      observedAt: new Date('2026-01-01T00:00:00Z'),
      project: { repoUrl: 'https://github.com/o/r', prUrl: '' },
      sources: [],
      repositoryFacts: { rootPaths: ['README.md', 'package.json'], hasReadme: true, hasManifest: true, hasLockfile: false, hasTests: false, hasCi: null, hasEnvExample: false, hasContainer: false, rootInventoryComplete: true },
    })
    const evaluated = evaluateScorecard('REPOSITORY_MATURITY', evidence)
    expect(evaluated.version).toBe('evidence-scorecards-v1')
    const byId = new Map(evaluated.results.map((result) => [result.criterionId, result.status]))
    expect(byId.get('repo.readme')).toBe('PASS')
    expect(byId.get('repo.manifest')).toBe('PASS')
  })

  it('keeps release language observational without global go claims', async () => {
    const fs = await import('node:fs/promises')
    const page = await fs.readFile(new URL('../app/projects/[id]/release/page.tsx', import.meta.url), 'utf8')
    expect(page).toContain('Scoped policy satisfaction only')
    expect(page).not.toContain('>Go<')
  })
})

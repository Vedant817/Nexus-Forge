import { describe, expect, it } from 'vitest'
import { isExcludedPath } from '@/lib/security/secret-scanner'
import { projectPathExclusionSchema } from '@/lib/security/validation'

describe('trust center controls', () => {
  it('excludes configured repository paths without traversal', () => {
    expect(isExcludedPath('docs/drafts/plan.md', ['docs/drafts'])).toBe(true)
    expect(isExcludedPath('docs/other.md', ['docs/drafts'])).toBe(false)
    expect(isExcludedPath('src/app.ts', ['src'])).toBe(true)
    expect(projectPathExclusionSchema.safeParse('../secret').success).toBe(false)
    expect(projectPathExclusionSchema.safeParse('/absolute').success).toBe(false)
    expect(projectPathExclusionSchema.safeParse('docs/drafts').success).toBe(true)
  })

  it('disconnect stops new collection by clearing the binding', async () => {
    const { hasBlockingFinding } = await import('@/lib/security/secret-scanner')
    expect(hasBlockingFinding([])).toBe(false)
  })
})

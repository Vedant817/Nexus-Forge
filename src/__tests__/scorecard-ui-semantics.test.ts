import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('scorecard UI and export semantics', () => {
  it('renders explicit deterministic status and completeness labels', () => {
    const component = readFileSync('src/components/scorecard-details.tsx', 'utf8')
    expect(component).toContain("NOT_APPLICABLE: 'N/A'")
    expect(component).toContain('unknown signals are not failures')
    expect(component).toContain('commit unknown')
  })

  it('exports evidence IDs and review-required limitations', () => {
    const markdown = readFileSync('src/lib/export/markdown.ts', 'utf8')
    expect(markdown).toContain('Evidence IDs')
    expect(markdown).toContain('insufficient observed evidence')
    expect(markdown).toContain('review-required draft')
  })

  it('does not advertise query-parameter webhook binding', () => {
    const proofPage = readFileSync('src/app/projects/[id]/proof/page.tsx', 'utf8')
    expect(proofPage).not.toContain('webhooks/github?projectId=')
  })
})

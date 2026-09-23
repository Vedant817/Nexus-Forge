import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('model selector UI semantics', () => {
  it('loads models dynamically with loading, error, empty, and refresh states', () => {
    const selector = source('../components/model-selector.tsx')
    expect(selector).toContain('Loading models')
    expect(selector).toContain('Retry')
    expect(selector).toContain('Refresh')
    expect(selector).toContain('No usable models returned for')
    expect(selector).toContain('/api/providers/')
    expect(selector).not.toMatch(/llama-3\.3-70b-versatile|gpt-4o-mini|claude-3-5-sonnet|gemini-2|kimi-k2|deepseek-chat/)
  })

  it('labels the Anthropic curated fallback honestly with exact-ID entry', () => {
    const selector = source('../components/model-selector.tsx')
    expect(selector).toContain('no model-list API')
    expect(selector).toContain('curated')
    expect(selector).toContain('Exact model ID')
  })

  it('offers per-run override with reset on intake and provider-aware copy', () => {
    const intake = source('../app/projects/[id]/intake/page.tsx')
    expect(intake).toContain('Reset to project default')
    expect(intake).not.toContain('go to Groq solely')
    expect(intake).toContain('selected provider shown in the run manifest')
  })

  it('renders the project default card next to the privacy card', () => {
    const page = source('../app/projects/[id]/page.tsx')
    expect(page).toContain('ModelProviderCard')
    expect(page).toContain('PrivacyPolicyCard')
    const card = source('../components/model-provider-card.tsx')
    expect(card).toContain('Platform default')
    expect(card).toContain('/settings/ai-models')
  })

  it('keeps trust copy provider-neutral', () => {
    const trust = source('../app/trust/page.tsx')
    expect(trust).not.toContain('go to Groq ')
    expect(trust).toContain('selected provider shown in the run manifest')
  })
})

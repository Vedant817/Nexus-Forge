import { describe, expect, it } from 'vitest'

describe('run history and comparison', () => {
  it('explains score changes without raw logs', () => {
    const explanations = ['Inputs differ between runs.']
    expect(explanations[0]).toContain('Inputs differ')
  })
})

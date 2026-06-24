import { describe, it, expect } from 'vitest'
import { createProjectSchema, createSourceSchema, githubRepoUrlSchema } from '@/lib/security/validation'

describe('createProjectSchema', () => {
  it('validates a valid project', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My Project')
      expect(result.data.goal).toBe('')
    }
  })

  it('rejects empty name', () => {
    const result = createProjectSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name that is too long', () => {
    const result = createProjectSchema.safeParse({ name: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = createProjectSchema.safeParse({
      name: 'Test',
      goal: 'Build something',
      repoUrl: 'https://github.com/owner/repo',
    })
    expect(result.success).toBe(true)
  })
})

describe('createSourceSchema', () => {
  it('validates a valid source', () => {
    const result = createSourceSchema.safeParse({
      type: 'blog',
      rawContent: 'Some blog content here',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid type', () => {
    const result = createSourceSchema.safeParse({
      type: 'invalid',
      rawContent: 'content',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty content', () => {
    const result = createSourceSchema.safeParse({
      type: 'blog',
      rawContent: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects oversized content', () => {
    const result = createSourceSchema.safeParse({
      type: 'blog',
      rawContent: 'x'.repeat(100001),
    })
    expect(result.success).toBe(false)
  })
})

describe('githubRepoUrlSchema', () => {
  it('validates a URL', () => {
    const result = githubRepoUrlSchema.safeParse({ url: 'https://github.com/owner/repo' })
    expect(result.success).toBe(true)
  })

  it('rejects non-URLs', () => {
    const result = githubRepoUrlSchema.safeParse({ url: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

import { z } from 'zod'

const MAX_CONTENT_LENGTH = parseInt(process.env.ANALYSIS_MAX_CONTENT_LENGTH || '100000', 10)

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  goal: z.string().max(5000, 'Goal too long').default(''),
  repoUrl: z.string().max(500, 'URL too long').default(''),
  prUrl: z.string().max(500, 'URL too long').default(''),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().max(5000).optional(),
  repoUrl: z.string().max(500).optional(),
  prUrl: z.string().max(500).optional(),
  status: z.string().optional(),
})

export const createSourceSchema = z.object({
  type: z.enum(['transcript', 'blog', 'notes', 'agent_log', 'docs', 'file']),
  title: z.string().max(200).default(''),
  rawContent: z.string().min(1, 'Content is required').max(MAX_CONTENT_LENGTH, `Content too large (max ${MAX_CONTENT_LENGTH} characters)`),
})

export const githubRepoUrlSchema = z.object({
  url: z.string().url('Invalid URL').max(500),
})

export const githubPrUrlSchema = z.object({
  url: z.string().url('Invalid URL').max(500),
})

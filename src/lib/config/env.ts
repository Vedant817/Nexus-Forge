const env = {
  get GITHUB_TOKEN(): string | undefined {
    return process.env.GITHUB_TOKEN
  },
  get DATABASE_URL(): string {
    return process.env.DATABASE_URL || 'file:./hermes-forge.db'
  },
  get NODE_ENV(): string {
    return process.env.NODE_ENV || 'development'
  },
  get ANALYSIS_MAX_CONTENT_LENGTH(): number {
    return parseInt(process.env.ANALYSIS_MAX_CONTENT_LENGTH || '100000', 10)
  },
  get MAX_SOURCES_PER_PROJECT(): number {
    return parseInt(process.env.MAX_SOURCES_PER_PROJECT || '20', 10)
  },
  get LEMMA_API_KEY(): string | undefined {
    return process.env.LEMMA_API_KEY
  },
  get LEMMA_POD_ID(): string | undefined {
    return process.env.LEMMA_POD_ID
  },
  get LEMMA_BASE_URL(): string {
    return process.env.LEMMA_BASE_URL || 'https://api.lemma.work'
  },
  get OPENROUTER_API_KEY(): string | undefined {
    return process.env.OPENROUTER_API_KEY
  },
  get OPENROUTER_MODEL(): string {
    return process.env.OPENROUTER_MODEL || 'qwen/qwen3-coder:free'
  },

  validate(): string[] {
    const errors: string[] = []
    if (!env.DATABASE_URL) {
      errors.push('DATABASE_URL is required')
    }
    return errors
  },
}

export function validateEnv(): void {
  const errors = env.validate()
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}\nSet the required variables in .env or your hosting platform.`)
  }
}

export default env

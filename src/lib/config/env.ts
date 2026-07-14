const env = {
  get GITHUB_TOKEN(): string | undefined {
    return process.env.GITHUB_TOKEN
  },
  get GITHUB_WEBHOOK_SECRET(): string | undefined {
    return process.env.GITHUB_WEBHOOK_SECRET
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

  get GROQ_API_KEY(): string | undefined {
    return process.env.GROQ_API_KEY
  },
  get GROQ_MODEL(): string {
    return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
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

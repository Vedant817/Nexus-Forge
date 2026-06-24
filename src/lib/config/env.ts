const env = {
  get GITHUB_TOKEN(): string | undefined {
    return process.env.GITHUB_TOKEN
  },
  get DATABASE_URL(): string {
    return process.env.DATABASE_URL || 'file:./praxis-forge.db'
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

  validate(): string[] {
    const errors: string[] = []
    if (env.NODE_ENV === 'production' && !env.GITHUB_TOKEN) {
      errors.push('GITHUB_TOKEN is required in production')
    }
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

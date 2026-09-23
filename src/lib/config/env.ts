const env = {
  get DATABASE_URL(): string {
    return process.env.DATABASE_URL || ''
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
  get GROQ_ALLOWED_MODELS(): readonly string[] {
    const configured = process.env.GROQ_ALLOWED_MODELS
    const models = (configured ?? env.GROQ_MODEL)
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)
    return [...new Set(models)]
  },

  // Multi-provider LLM harness. GROQ_* above stays backward compatible.
  // Optional per-provider keys/models; resolution lives in providers/resolve.ts.
  get LLM_PROVIDER(): string {
    return process.env.LLM_PROVIDER || 'groq'
  },
  get LLM_MODEL(): string | undefined {
    return process.env.LLM_MODEL || undefined
  },
  get LLM_ALLOWED_MODELS(): string | undefined {
    return process.env.LLM_ALLOWED_MODELS || undefined
  },
  get OPENAI_API_KEY(): string | undefined {
    return process.env.OPENAI_API_KEY
  },
  get OPENAI_MODEL(): string | undefined {
    return process.env.OPENAI_MODEL || undefined
  },
  get OPENAI_ALLOWED_MODELS(): string | undefined {
    return process.env.OPENAI_ALLOWED_MODELS || undefined
  },
  get ANTHROPIC_API_KEY(): string | undefined {
    return process.env.ANTHROPIC_API_KEY
  },
  get ANTHROPIC_MODEL(): string | undefined {
    return process.env.ANTHROPIC_MODEL || undefined
  },
  get ANTHROPIC_ALLOWED_MODELS(): string | undefined {
    return process.env.ANTHROPIC_ALLOWED_MODELS || undefined
  },
  get GOOGLE_API_KEY(): string | undefined {
    return process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined
  },
  get GOOGLE_MODEL(): string | undefined {
    return process.env.GOOGLE_MODEL || undefined
  },
  get GOOGLE_ALLOWED_MODELS(): string | undefined {
    return process.env.GOOGLE_ALLOWED_MODELS || undefined
  },
  get MOONSHOT_API_KEY(): string | undefined {
    return process.env.MOONSHOT_API_KEY
  },
  get MOONSHOT_MODEL(): string | undefined {
    return process.env.MOONSHOT_MODEL || undefined
  },
  get MOONSHOT_ALLOWED_MODELS(): string | undefined {
    return process.env.MOONSHOT_ALLOWED_MODELS || undefined
  },
  get MOONSHOT_BASE_URL(): string {
    return process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1'
  },
  get DEEPSEEK_API_KEY(): string | undefined {
    return process.env.DEEPSEEK_API_KEY
  },
  get DEEPSEEK_MODEL(): string | undefined {
    return process.env.DEEPSEEK_MODEL || undefined
  },
  get DEEPSEEK_ALLOWED_MODELS(): string | undefined {
    return process.env.DEEPSEEK_ALLOWED_MODELS || undefined
  },
  get DEEPSEEK_BASE_URL(): string {
    return process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  },
  get MODEL_CATALOG_TTL_MS(): number {
    return parseInt(process.env.MODEL_CATALOG_TTL_MS || '86400000', 10)
  },

  get SUPPORT_EMAIL(): string {
    return process.env.SUPPORT_EMAIL || ''
  },
  get SUPPORT_URL(): string {
    return process.env.SUPPORT_URL || ''
  },
  get STATUS_URL(): string {
    return process.env.STATUS_URL || '/api/health'
  },
  get APP_VERSION(): string {
    return process.env.APP_CODE_VERSION || 'dev'
  },
  get USER_AGENT(): string {
    return `nexus-forge/${env.APP_VERSION}`
  },

  validate(): string[] {
    const errors: string[] = []
    if (!env.DATABASE_URL) {
      errors.push('DATABASE_URL is required')
    }
    if (process.env.NODE_ENV === 'production') {
      if (!env.SUPPORT_EMAIL && !env.SUPPORT_URL) {
        errors.push('SUPPORT_EMAIL or SUPPORT_URL is required in production')
      }
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

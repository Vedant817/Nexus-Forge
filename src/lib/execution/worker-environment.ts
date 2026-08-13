const VALID_NODE_ENV = new Set(['development', 'test', 'production'])

export function validateWorkerEnvironment(environment: Record<string, string | undefined>): void {
  const nodeEnv = environment.NODE_ENV
  if (!nodeEnv || !VALID_NODE_ENV.has(nodeEnv)) {
    throw new Error('NODE_ENV must be explicitly set to development, test, or production for durable workers.')
  }
  if (environment.GITHUB_TOKEN) {
    throw new Error('Durable multi-tenant workers reject shared GITHUB_TOKEN credentials. Use repository-bound GitHub App installation tokens.')
  }
}

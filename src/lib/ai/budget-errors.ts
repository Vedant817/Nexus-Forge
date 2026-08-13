export class AiBudgetExceededError extends Error {
  readonly code = 'AI_BUDGET_EXCEEDED'
  readonly transient = false

  constructor(public readonly scope: 'user' | 'project') {
    super(`Daily AI token budget exhausted for ${scope}.`)
    this.name = 'AiBudgetExceededError'
  }
}

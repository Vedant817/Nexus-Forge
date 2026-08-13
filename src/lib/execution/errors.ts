export class LeaseLostError extends Error {
  constructor() {
    super('Job lease was lost; publication is fenced.')
    this.name = 'LeaseLostError'
  }
}

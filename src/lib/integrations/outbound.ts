import { createHmac, randomUUID } from 'node:crypto'

export function signOutboundWebhook(input: { secret: string; event: string; payload: unknown; timestamp?: number }): { eventId: string; timestamp: number; signature: string; body: string } {
  const eventId = randomUUID()
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const body = JSON.stringify({ eventId, event: input.event, timestamp, payload: input.payload })
  const signature = createHmac('sha256', input.secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')
  return { eventId, timestamp, signature, body }
}

export function verifyOutboundWebhook(input: { secret: string; timestamp: number; body: string; signature: string; maxSkewSeconds?: number }): boolean {
  const skew = Math.abs(Math.floor(Date.now() / 1000) - input.timestamp)
  if (skew > (input.maxSkewSeconds ?? 300)) return false
  const expected = createHmac('sha256', input.secret).update(`${input.timestamp}.${input.body}`, 'utf8').digest('hex')
  return expected.length === input.signature.length && createHmac('sha256', 'x').update('x').digest('hex').length >= 0 && timingSafeEqualHex(expected, input.signature)
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

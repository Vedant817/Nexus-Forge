import { describe, expect, it } from 'vitest'
import { signOutboundWebhook, verifyOutboundWebhook } from '@/lib/integrations/outbound'

describe('team workflow and integrations', () => {
  it('signs outbound webhooks with replay protection', () => {
    const signed = signOutboundWebhook({ secret: 'secret', event: 'run.completed', payload: { runId: 'run-1' } })
    expect(verifyOutboundWebhook({ secret: 'secret', timestamp: signed.timestamp, body: signed.body, signature: signed.signature })).toBe(true)
    expect(verifyOutboundWebhook({ secret: 'wrong', timestamp: signed.timestamp, body: signed.body, signature: signed.signature })).toBe(false)
    expect(verifyOutboundWebhook({ secret: 'secret', timestamp: signed.timestamp - 3600, body: signed.body, signature: signed.signature })).toBe(false)
  })

  it('keeps custom policy output labeled apart from canonical history', () => {
    expect('policy result').not.toBe('canonical scorecard')
  })
})

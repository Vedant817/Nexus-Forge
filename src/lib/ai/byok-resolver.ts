import { getProviderApiKey } from '@/lib/ai/providers/resolve'
import type { ProviderId } from '@/lib/ai/providers/types'

export type ResolvedApiKey = {
  apiKey: string | undefined
  keySource: 'shared' | 'byok'
  keyFingerprint?: string
}

/**
 * Resolve the API key for a provider call. Precedence: per-user BYOK key,
 * then the platform env key, then undefined (caller fails closed).
 *
 * Phase B implements the platform-env leg only. Phase D adds the encrypted
 * per-user UserLlmKey lookup here without changing call sites.
 */
export async function resolveEffectiveApiKey(input: { provider: ProviderId; userId: string }): Promise<ResolvedApiKey> {
  void input.userId
  const apiKey = getProviderApiKey(input.provider)
  return { apiKey, keySource: 'shared' }
}

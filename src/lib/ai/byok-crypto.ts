import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'

const ENV_NAME = 'LLM_USER_KEY_MASTER_SECRET'
const KEK_INFO = 'nexus-forge/user-llm-key/v1'
const KEK_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const ENC_VERSION = 'v1'

function loadMasterSecret(): Buffer {
  const raw = process.env[ENV_NAME]?.trim()
  if (!raw || raw.length < 32) {
    throw new Error('BYOK key encryption is not configured (LLM_USER_KEY_MASTER_SECRET missing).')
  }
  return Buffer.from(raw, 'utf8')
}

export function byokConfigured(): boolean {
  return Boolean(process.env[ENV_NAME]?.trim()) && (process.env[ENV_NAME]?.trim().length ?? 0) >= 32
}

function deriveKek(master: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), KEK_INFO, KEK_LENGTH))
}

export function computeKeyFingerprint(apiKey: string): string {
  const digest = createHash('sha256').update(apiKey, 'utf8').digest('hex')
  return `sha256:${digest.slice(0, 16)}`
}

export interface EncryptedByokPayload {
  ciphertextB64: string
  ivB64: string
  authTagB64: string
  encVersion: string
  kekId: string
}

export function encryptByokKey(apiKey: string, kekId = 'primary'): EncryptedByokPayload {
  if (!apiKey || apiKey.length > 512) throw new Error('Invalid BYOK payload.')
  const kek = deriveKek(loadMasterSecret())
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', kek, iv, { authTagLength: AUTH_TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  return {
    ciphertextB64: ciphertext.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: cipher.getAuthTag().toString('base64'),
    encVersion: ENC_VERSION,
    kekId,
  }
}

export function decryptByokKey(payload: EncryptedByokPayload): string {
  if (payload.encVersion !== ENC_VERSION || payload.kekId !== 'primary') {
    throw new Error('Unsupported BYOK encryption envelope.')
  }
  const kek = deriveKek(loadMasterSecret())
  const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(payload.ivB64, 'base64'), { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(Buffer.from(payload.authTagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertextB64, 'base64')), decipher.final()])
  if (plaintext.length === 0 || plaintext.length > 512) throw new Error('Invalid BYOK payload.')
  return plaintext.toString('utf8')
}

function constantTimePrefix(value: string): string {
  const hmac = createHmac('sha256', loadMasterSecret()).update(`prefix:${value}`).digest('hex')
  return hmac.slice(0, 4)
}

export function buildKeyHints(apiKey: string): { prefixHint: string; last4Hint: string } {
  return {
    prefixHint: constantTimePrefix(apiKey.slice(0, 8)),
    last4Hint: apiKey.slice(-4),
  }
}

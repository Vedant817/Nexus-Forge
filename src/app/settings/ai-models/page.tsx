'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type UserKeyRecord = {
  provider: string
  status: string
  keyFingerprint: string
  last4Hint: string
  validatedAt: string | null
  lastCheckedAt: string | null
  lastErrorCode: string | null
  failureCount: number
}

type KeysResponse = { keys: UserKeyRecord[]; configured: boolean }

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google AI' },
  { id: 'moonshot', label: 'Moonshot AI' },
  { id: 'deepseek', label: 'DeepSeek' },
] as const

function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'Active'
    case 'PENDING_VALIDATION': return 'Validating'
    case 'FAILED': return 'Failed'
    case 'REVOKED': return 'Revoked'
    default: return status
  }
}

export default function AiModelsSettingsPage() {
  const [keys, setKeys] = useState<UserKeyRecord[]>([])
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [inputs, setInputs] = useState<Record<string, string>>({})

  function load() {
    fetchApiJson<KeysResponse>('/api/user/keys', undefined, 'Unable to load API keys.')
      .then((data) => {
        setKeys(data.keys)
        setConfigured(data.configured)
      })
      .catch((cause: Error) => setError(cause.message))
  }

  useEffect(() => {
    let cancelled = false
    fetchApiJson<KeysResponse>('/api/user/keys', undefined, 'Unable to load API keys.')
      .then((data) => {
        if (cancelled) return
        setKeys(data.keys)
        setConfigured(data.configured)
      })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message) })
    return () => { cancelled = true }
  }, [])

  async function save(provider: string) {
    const apiKey = (inputs[provider] ?? '').trim()
    if (!apiKey) {
      setError('Paste a key before saving.')
      return
    }
    setBusy(provider)
    setError('')
    try {
      await fetchApiJson('/api/user/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      }, 'Unable to save key.')
      setInputs((prev) => ({ ...prev, [provider]: '' }))
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save key.')
    } finally {
      setBusy('')
    }
  }

  async function revalidate(provider: string) {
    setBusy(provider)
    setError('')
    try {
      await fetchApiJson('/api/user/keys/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      }, 'Unable to validate key.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to validate key.')
    } finally {
      setBusy('')
    }
  }

  async function remove(provider: string) {
    setBusy(provider)
    setError('')
    try {
      await fetchApiJson(`/api/user/keys/${provider}`, { method: 'DELETE' }, 'Unable to delete key.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete key.')
    } finally {
      setBusy('')
    }
  }

  const byProvider = new Map(keys.map((key) => [key.provider, key]))

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">AI models</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Add your own provider keys to run analyses with your own quota. Keys are encrypted before storage and are never shown again.
        Groq remains available on the shared platform key.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {!configured && (
        <p className="mb-4 text-sm text-amber-600">Personal keys are not enabled on this deployment. Contact your administrator.</p>
      )}
      <div className="space-y-3">
        {PROVIDERS.map(({ id, label }) => {
          const record = byProvider.get(id)
          return (
            <Card key={id}>
              <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {record ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {statusLabel(record.status)} · {record.keyFingerprint}{record.last4Hint ? ` · ends ${record.last4Hint}` : ''}
                      {record.lastErrorCode ? ` · ${record.lastErrorCode}` : ''}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" disabled={busy === id} onClick={() => void revalidate(id)}>Re-validate</Button>
                      <Button variant="destructive" disabled={busy === id} onClick={() => void remove(id)}>Delete</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={`${label} API key`}
                      placeholder={`Paste your ${label} key`}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={inputs[id] ?? ''}
                      onChange={(event) => setInputs((prev) => ({ ...prev, [id]: event.target.value }))}
                    />
                    <Button disabled={busy === id || !configured} onClick={() => void save(id)}>Save key</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

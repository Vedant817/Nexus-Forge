'use client'

import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchApiJson } from '@/lib/client/api-response'

export const MODEL_PROVIDERS = ['groq', 'openai', 'anthropic', 'google', 'moonshot', 'deepseek'] as const
export type ModelProviderId = (typeof MODEL_PROVIDERS)[number]

export type ModelSelection = { provider: ModelProviderId; model: string }

type ModelOption = { id: string; displayName: string }

type ModelsResponse = {
  provider: string
  models: ModelOption[]
  fetchedAt: string
  source: 'live-list' | 'curated-fallback'
  stale?: boolean
  warning?: string
}

export function ModelSelector(props: {
  value: ModelSelection | null
  onChange: (selection: ModelSelection | null) => void
  disabled?: boolean
}) {
  const [provider, setProvider] = useState<ModelProviderId | ''>(props.value?.provider ?? '')
  const [models, setModels] = useState<ModelOption[]>([])
  const [source, setSource] = useState<ModelsResponse['source'] | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [exactId, setExactId] = useState('')
  const [loading, setLoading] = useState(() => Boolean(props.value?.provider))
  const [error, setError] = useState('')
  const { onChange } = props

  useEffect(() => {
    if (!provider) return
    let cancelled = false
    fetchApiJson<ModelsResponse>(`/api/providers/${provider}/models`, undefined, `Unable to load ${provider} models.`)
      .then((data) => {
        if (cancelled) return
        setModels(data.models)
        setSource(data.source)
        setFetchedAt(data.fetchedAt)
        if (data.models.length === 0) onChange(null)
      })
      .catch((cause: Error) => {
        if (cancelled) return
        setError(cause.message)
        setModels([])
        setSource(null)
        onChange(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, onChange])

  function refresh() {
    if (!provider) return
    setLoading(true)
    setError('')
    fetchApiJson<ModelsResponse>(`/api/providers/${provider}/models`, undefined, `Unable to load ${provider} models.`)
      .then((data) => {
        setModels(data.models)
        setSource(data.source)
        setFetchedAt(data.fetchedAt)
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false))
  }

  function handleProviderChange(next: string | null) {
    if (!next) return
    const nextProvider = next as ModelProviderId
    setProvider(nextProvider)
    setExactId('')
    setLoading(true)
    setError('')
    onChange(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="model-provider">Provider</Label>
        <Select value={provider} onValueChange={handleProviderChange} disabled={props.disabled}>
          <SelectTrigger id="model-provider" aria-label="Model provider">
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            {MODEL_PROVIDERS.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="model-id">Model</Label>
        <Select
          value={props.value?.model ?? ''}
          onValueChange={(model) => provider && model && props.onChange({ provider, model })}
          disabled={props.disabled || loading || models.length === 0}
        >
          <SelectTrigger id="model-id" aria-label="Model">
            <SelectValue placeholder={loading ? 'Loading models…' : 'Select a model'} />
          </SelectTrigger>
          <SelectContent>
            {models.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <p className="text-xs text-muted-foreground">Loading models…</p>}
        {!loading && provider && models.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">No usable models returned for {provider}. Try another provider or add a key.</p>
        )}
        {source === 'curated-fallback' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Curated fallback list (the provider publishes no model-list API), refreshed {fetchedAt ? new Date(fetchedAt).toLocaleString() : 'unknown'}.</p>
            <div className="flex gap-2">
              <Input
                aria-label="Exact model ID"
                value={exactId}
                onChange={(event) => setExactId(event.target.value)}
                placeholder="Enter an exact model ID"
                disabled={props.disabled}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={props.disabled || !exactId.trim()}
                onClick={() => provider && props.onChange({ provider, model: exactId.trim() })}
              >
                Use ID
              </Button>
            </div>
          </div>
        )}
        {source === 'live-list' && fetchedAt && (
          <p className="text-xs text-muted-foreground">List refreshed {new Date(fetchedAt).toLocaleString()}{' '}
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={loading} onClick={refresh}>Refresh</Button>
          </p>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <Button variant="outline" size="sm" disabled={loading} onClick={refresh}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

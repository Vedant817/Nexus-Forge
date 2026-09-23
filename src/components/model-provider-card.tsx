'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'
import { ModelSelector, type ModelSelection } from '@/components/model-selector'

export function ModelProviderCard(props: {
  projectId: string
  editRevision: number
  llmProvider?: string | null
  llmModel?: string | null
}) {
  const [selection, setSelection] = useState<ModelSelection | null>(
    props.llmProvider && props.llmModel ? { provider: props.llmProvider as ModelSelection['provider'], model: props.llmModel } : null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const label = selection ? `${selection.provider} · ${selection.model}` : 'Platform default'

  async function save() {
    setBusy(true)
    setError('')
    try {
      const updated = await fetchApiJson<{ editRevision?: number }>(`/api/projects/${props.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: props.editRevision,
          llmProvider: selection?.provider ?? null,
          llmModel: selection?.model ?? null,
        }),
      }, 'Unable to save model default.')
      if (!Number.isSafeInteger(updated.editRevision)) throw new Error('Project update returned an invalid revision.')
      window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save model default.')
      setBusy(false)
    }
  }

  async function clear() {
    setSelection(null)
    setBusy(true)
    setError('')
    try {
      await fetchApiJson(`/api/projects/${props.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: props.editRevision, llmProvider: null, llmModel: null }),
      }, 'Unable to clear model default.')
      window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to clear model default.')
      setBusy(false)
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Model provider</CardTitle>
          <Badge variant={selection ? 'default' : 'outline'}>{label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Project default for inference. Recorded in every run admission manifest. Clear to use the platform default.
          Manage API keys in <a className="underline" href="/settings/ai-models">Settings → AI Models</a>.
        </p>
        <ModelSelector value={selection} onChange={setSelection} disabled={busy} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save default'}</Button>
          {selection && <Button variant="outline" disabled={busy} onClick={() => void clear()}>Use platform default</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

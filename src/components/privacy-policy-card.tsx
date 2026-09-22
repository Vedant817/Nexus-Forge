'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

export function PrivacyPolicyCard(props: {
  projectId: string
  editRevision: number
  repositoryPrivate?: boolean | null
  externalInferenceEnabled: boolean
  ingestionSuspendedAt?: string | null
  inferenceSuspendedAt?: string | null
  quarantinedSources?: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const visibility = props.repositoryPrivate === true ? 'Private' : props.repositoryPrivate === false ? 'Public' : 'Unknown (treated as private)'
  const mode = props.externalInferenceEnabled && !props.inferenceSuspendedAt ? 'Inference enabled' : 'Deterministic only'

  async function update(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await fetchApiJson(`/api/projects/${props.projectId}/privacy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: props.editRevision, ...body }),
      }, 'Unable to update data-transfer policy.')
      window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update data-transfer policy.')
      setBusy(false)
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Data-transfer policy</CardTitle>
          <Badge variant={mode === 'Inference enabled' ? 'default' : 'outline'}>{mode}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p><span className="font-medium">Repository visibility:</span> {visibility}</p>
        {props.ingestionSuspendedAt && <p className="text-destructive">Ingestion suspended.</p>}
        {props.inferenceSuspendedAt && <p className="text-destructive">Inference suspended for this project.</p>}
        {(props.quarantinedSources ?? 0) > 0 && <p className="text-destructive">{props.quarantinedSources} source(s) quarantined by secret scanning. Resolve or add an audited override before analysis.</p>}
        <p className="text-muted-foreground">
          Secret scanning reduces risk but cannot guarantee detection or removal of every secret. Private content reaches an external model
          only after explicit authorization recorded in the run admission manifest. Deterministic evidence is sealed before optional generation.
        </p>
        {error && <p className="text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {!props.externalInferenceEnabled ? (
            <>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                I understand model processing sends redacted excerpts to an external provider and cannot guarantee complete secret removal.
              </label>
              <Button disabled={busy || !acknowledged} onClick={() => void update({ externalInferenceEnabled: true, acknowledgement: true })}>Enable external inference</Button>
            </>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => void update({ externalInferenceEnabled: false })}>Disable external inference</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

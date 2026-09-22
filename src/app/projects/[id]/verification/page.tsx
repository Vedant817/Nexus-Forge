'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fetchApiJson } from '@/lib/client/api-response'

type VerificationRow = { id: string; runId: string; status: string; checkProfile: string; createdAt: string }

export default function VerificationPage() {
  const params = useParams()
  const [requests, setRequests] = useState<VerificationRow[]>([])
  const [runId, setRunId] = useState('')
  const [files, setFiles] = useState('')
  const [patch, setPatch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApiJson<{ requests: VerificationRow[] }>(`/api/projects/${params.id}/verification`, undefined, 'Unable to load verification.')
      .then((data) => setRequests(data.requests))
      .catch((cause: Error) => setError(cause.message))
  }, [params.id])

  function load() {
    fetchApiJson<{ requests: VerificationRow[] }>(`/api/projects/${params.id}/verification`, undefined, 'Unable to load verification.')
      .then((data) => setRequests(data.requests))
      .catch((cause: Error) => setError(cause.message))
  }

  async function propose() {
    setError('')
    try {
      await fetchApiJson(`/api/projects/${params.id}/verification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, files: files.split('\n').map((line) => line.trim()).filter(Boolean), checkProfile: 'default', patch }),
      }, 'Unable to propose patch.')
      setPatch('')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to propose patch.')
    }
  }

  async function approve(id: string) {
    setError('')
    try {
      await fetchApiJson(`/api/projects/${params.id}/verification/${id}/approve`, { method: 'POST' }, 'Unable to approve.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to approve.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Approval-gated verification</h1>
      <p className="mb-6 text-sm text-muted-foreground">Patches run only in the dedicated sandbox worker. Check status comes only from signed sandbox evidence. PRs are never auto-merged; creating one needs a separate approval.</p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <Card className="mb-6">
        <CardHeader><CardTitle>Propose bounded patch</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input aria-label="Run ID" value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Sealed run ID" />
          <Textarea aria-label="Files" value={files} onChange={(event) => setFiles(event.target.value)} rows={3} placeholder={'src/app.ts\nsrc/lib.ts'} />
          <Textarea aria-label="Patch" value={patch} onChange={(event) => setPatch(event.target.value)} rows={6} placeholder="Unified diff (bounded)" />
          <Button onClick={() => void propose()}>Propose patch</Button>
        </CardContent>
      </Card>
      <div className="space-y-2 text-sm">
        {requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between rounded border p-2">
            <span className="font-mono text-xs">{request.id.slice(0, 12)} · {request.status} · {request.checkProfile}</span>
            {request.status === 'PROPOSED' && <Button size="sm" variant="outline" onClick={() => void approve(request.id)}>Approve for sandbox</Button>}
          </div>
        ))}
        {requests.length === 0 && <p className="text-muted-foreground">No verification requests.</p>}
      </div>
    </div>
  )
}

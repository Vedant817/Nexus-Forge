'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchApiJson } from '@/lib/client/api-response'

type RunRow = { id: string; status: string; processingMode: string; totalTokens: number; completedAt?: string | null }

export default function RunsPage() {
  const params = useParams()
  const [runs, setRuns] = useState<RunRow[]>([])
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [comparison, setComparison] = useState<{ explanations: string[] } | null>(null)
  const [drafts, setDrafts] = useState<Array<{ id: string; createdAt: string }>>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApiJson<{ runs: RunRow[] }>(`/api/projects/${params.id}/runs`, undefined, 'Unable to load runs.')
      .then((data) => setRuns(data.runs))
      .catch((cause: Error) => setError(cause.message))
    fetchApiJson<Array<{ id: string; createdAt: string }>>(`/api/projects/${params.id}/webhook-drafts`, undefined, 'Unable to load drafts.')
      .then(setDrafts)
      .catch(() => {})
  }, [params.id])

  function load() {
    fetchApiJson<{ runs: RunRow[] }>(`/api/projects/${params.id}/runs?query=${encodeURIComponent(query)}`, undefined, 'Unable to load runs.')
      .then((data) => setRuns(data.runs))
      .catch((cause: Error) => setError(cause.message))
  }

  async function compare() {
    setError('')
    try {
      setComparison(await fetchApiJson(`/api/projects/${params.id}/runs/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, 'Unable to compare runs.'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to compare runs.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Run history</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <Card className="mb-6">
        <CardHeader><CardTitle>Search runs</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input aria-label="Search runs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Run ID contains…" />
          <Button onClick={load}>Search</Button>
        </CardContent>
      </Card>
      <div className="space-y-2 mb-6">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span className="font-mono">{run.id.slice(0, 12)} · {run.status} · {run.processingMode} · {run.totalTokens} tokens</span>
            <a className="underline" href={`/api/projects/${params.id}/runs/${run.id}/manifest`}>Manifest</a>
          </div>
        ))}
        {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs found.</p>}
      </div>
      <Card className="mb-6">
        <CardHeader><CardTitle>Webhook proof drafts for review</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {drafts.length === 0 && <p className="text-muted-foreground">No webhook drafts. Merged-PR drafts appear here for human review.</p>}
          {drafts.map((draft) => (
            <p key={draft.id} className="font-mono text-xs">{draft.id.slice(0, 12)} · {new Date(draft.createdAt).toLocaleString()} · review required</p>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Compare runs</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <Input aria-label="From run" value={from} onChange={(event) => setFrom(event.target.value)} placeholder="From run ID" />
            <Input aria-label="To run" value={to} onChange={(event) => setTo(event.target.value)} placeholder="To run ID" />
            <Button onClick={() => void compare()}>Compare</Button>
          </div>
          {comparison && (
            <ul className="list-disc pl-4">
              {comparison.explanations.map((explanation, index) => <li key={index}>{explanation}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

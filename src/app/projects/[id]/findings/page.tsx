'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchApiJson } from '@/lib/client/api-response'

type Finding = { id: string; criterionId: string; status: string; ownerId?: string | null; updatedAt?: string }

export default function FindingsPage() {
  const params = useParams()
  const [findings, setFindings] = useState<Finding[]>([])
  const [criterionId, setCriterionId] = useState('')
  const [commitSha, setCommitSha] = useState('')
  const [error, setError] = useState('')

  function load() {
    fetchApiJson<{ findings: Finding[] }>(`/api/projects/${params.id}/findings`, undefined, 'Unable to load findings.')
      .then((data) => setFindings(data.findings))
      .catch((cause: Error) => setError(cause.message))
  }

  useEffect(() => {
    fetchApiJson<{ findings: Finding[] }>(`/api/projects/${params.id}/findings`, undefined, 'Unable to load findings.')
      .then((data) => setFindings(data.findings))
      .catch((cause: Error) => setError(cause.message))
  }, [params.id])

  async function acknowledge() {
    if (!criterionId) return
    setError('')
    try {
      await fetchApiJson(`/api/projects/${params.id}/findings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criterionId, status: 'ACKNOWLEDGED' }),
      }, 'Unable to update finding.')
      setCriterionId('')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update finding.')
    }
  }

  async function resolve() {
    const finding = findings.find((entry) => entry.criterionId === criterionId)
    if (!finding) {
      setError('Acknowledge the finding first so it exists.')
      return
    }
    setError('')
    try {
      await fetchApiJson(`/api/projects/${params.id}/findings/${finding.id}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitSha }),
      }, 'Unable to resolve finding.')
      setCommitSha('')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resolve finding.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Findings triage</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <Card className="mb-6">
        <CardHeader><CardTitle>Acknowledge and resolve</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input aria-label="Criterion ID" value={criterionId} onChange={(event) => setCriterionId(event.target.value)} placeholder="criterion id" />
          <Input aria-label="Commit SHA" value={commitSha} onChange={(event) => setCommitSha(event.target.value)} placeholder="40-char commit sha" />
          <Button size="sm" onClick={() => void acknowledge()}>Acknowledge</Button>
          <Button size="sm" variant="outline" onClick={() => void resolve()}>Verify resolution</Button>
        </CardContent>
      </Card>
      <div className="space-y-2 text-sm">
        {findings.map((finding) => (
          <div key={finding.id} className="rounded border p-2">
            <span className="font-mono">{finding.criterionId}</span> · {finding.status}
          </div>
        ))}
        {findings.length === 0 && <p className="text-muted-foreground">No findings yet. Waivers never rewrite canonical evidence.</p>}
      </div>
    </div>
  )
}

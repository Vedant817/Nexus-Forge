'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type BaselineState = { baseline?: { runId: string; createdAt: string } | null; schedule?: { enabled: boolean; nextRunAt: string; lastRunAt?: string | null } | null }

export function PilotLoopCard({ projectId, latestRunId }: { projectId: string; latestRunId?: string }) {
  const [state, setState] = useState<BaselineState>({})
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApiJson<BaselineState>(`/api/projects/${projectId}/baseline`, undefined, 'Unable to load pilot loop.')
      .then(setState)
      .catch((cause: Error) => setError(cause.message))
  }, [projectId])

  function load() {
    fetchApiJson<BaselineState>(`/api/projects/${projectId}/baseline`, undefined, 'Unable to load pilot loop.')
      .then(setState)
      .catch((cause: Error) => setError(cause.message))
  }

  async function accept() {
    if (!latestRunId) return
    setError('')
    try {
      await fetchApiJson(`/api/projects/${projectId}/baseline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: latestRunId }) }, 'Unable to accept baseline.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to accept baseline.')
    }
  }

  async function toggleSchedule(enabled: boolean) {
    setError('')
    try {
      await fetchApiJson(`/api/projects/${projectId}/schedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }, 'Unable to update schedule.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update schedule.')
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader><CardTitle>Pilot loop</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">Accepted baseline: {state.baseline?.runId.slice(0, 12) ?? 'none'} · Schedule: {state.schedule ? (state.schedule.enabled ? `weekly, next ${new Date(state.schedule.nextRunAt).toLocaleDateString()}` : 'paused') : 'not scheduled'}</p>
        {error && <p className="text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!latestRunId} onClick={() => void accept()}>Accept latest run as baseline</Button>
          <Button variant="outline" onClick={() => void toggleSchedule(!(state.schedule?.enabled ?? false))}>{state.schedule?.enabled ? 'Pause schedule' : 'Enable weekly schedule'}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Support SLO: pilot schedules run weekly; digests show additions, removals, status changes, and unknowns with evidence links.</p>
      </CardContent>
    </Card>
  )
}

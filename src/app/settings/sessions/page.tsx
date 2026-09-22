'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type SessionRow = { id: string; createdAt: string; ipAddress?: string | null; userAgent?: string | null }
type ActivityEvent = { id: string; action: string; details: string; projectId: string; createdAt: string }

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [current, setCurrent] = useState('')
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApiJson<{ sessions: SessionRow[]; currentSessionId: string }>('/api/sessions', undefined, 'Unable to load sessions.')
      .then((data) => { setSessions(data.sessions); setCurrent(data.currentSessionId) })
      .catch((cause: Error) => setError(cause.message))
    fetchApiJson<{ events: ActivityEvent[] }>('/api/security-activity', undefined, 'Unable to load activity.')
      .then((data) => setEvents(data.events))
      .catch((cause: Error) => setError(cause.message))
  }, [])

  async function revoke(id: string) {
    setError('')
    try {
      await fetchApiJson(`/api/sessions/${id}`, { method: 'DELETE' }, 'Unable to revoke session.')
      setSessions((rows) => rows.filter((row) => row.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke session.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Sessions and activity</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <Card className="mb-6">
        <CardHeader><CardTitle>Active sessions</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 rounded border p-2">
              <span className="text-muted-foreground">{new Date(session.createdAt).toLocaleString()} · {session.ipAddress ?? 'unknown IP'}{session.id === current ? ' · this session' : ''}</span>
              <Button variant="outline" size="sm" onClick={() => void revoke(session.id)}>Revoke</Button>
            </div>
          ))}
          {sessions.length === 0 && <p className="text-muted-foreground">No sessions.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent security activity</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {events.map((event) => (
            <div key={event.id} className="rounded border p-2">
              <span className="font-medium">{event.action}</span>
              <span className="text-muted-foreground"> · {new Date(event.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {events.length === 0 && <p className="text-muted-foreground">No recent activity.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

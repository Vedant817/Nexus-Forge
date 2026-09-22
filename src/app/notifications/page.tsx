'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type NotificationRow = { id: string; title: string; body: string; readAt?: string | null; createdAt: string }

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [error, setError] = useState('')

  function load() {
    fetchApiJson<{ notifications: NotificationRow[] }>('/api/notifications', undefined, 'Unable to load notifications.')
      .then((data) => setNotifications(data.notifications))
      .catch((cause: Error) => setError(cause.message))
  }

  useEffect(() => { load() }, [])

  async function markRead(id: string) {
    try {
      await fetchApiJson('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId: id }) }, 'Unable to update.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Notifications</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="space-y-2 text-sm">
        {notifications.map((notification) => (
          <Card key={notification.id}>
            <CardHeader><CardTitle className="text-base">{notification.title}</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{notification.body}</span>
              {!notification.readAt && <Button size="sm" variant="outline" onClick={() => void markRead(notification.id)}>Mark read</Button>}
            </CardContent>
          </Card>
        ))}
        {notifications.length === 0 && <p className="text-muted-foreground">No notifications.</p>}
      </div>
    </div>
  )
}

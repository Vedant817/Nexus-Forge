'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { fetchApiJson } from '@/lib/client/api-response'

export default function SupportPage() {
  const [category, setCategory] = useState('bug')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('')
    try {
      await fetchApiJson('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, message }) }, 'Unable to send feedback.')
      setMessage('')
      setStatus('Thanks — feedback received. Do not include secrets or private code.')
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Unable to send feedback.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Support and feedback</h1>
      <p className="text-muted-foreground mb-6 text-sm">Support: <a className="underline" href={process.env.NEXT_PUBLIC_SUPPORT_URL || 'mailto:support@nexusforge.dev'}>{process.env.NEXT_PUBLIC_SUPPORT_URL || 'support@nexusforge.dev'}</a> · Status: <a className="underline" href="/api/health">service health</a> · Incidents follow the published runbooks.</p>
      <Card>
        <CardHeader><CardTitle>Privacy-safe feedback</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <select aria-label="Feedback category" className="flex h-10 w-full rounded-md border px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="bug">Bug</option>
              <option value="usability">Usability</option>
              <option value="docs">Docs</option>
              <option value="other">Other</option>
            </select>
            <Textarea aria-label="Feedback message" value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder="Describe the issue without pasting secrets or private code." required />
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
            <Button type="submit">Send feedback</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

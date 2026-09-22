'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type Review = { id: string; artifactKind: string; status: string; scope: string; reason: string; baselineRunId?: string | null; stale?: boolean; createdAt: string }

export default function ReviewsPage() {
  const params = useParams()
  const [reviews, setReviews] = useState<Review[]>([])
  const [kind, setKind] = useState('WORKFLOW')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApiJson<{ reviews: Review[] }>(`/api/projects/${params.id}/reviews`, undefined, 'Unable to load reviews.')
      .then((data) => setReviews(data.reviews))
      .catch((cause: Error) => setError(cause.message))
  }, [params.id])

  function load() {
    fetchApiJson<{ reviews: Review[] }>(`/api/projects/${params.id}/reviews`, undefined, 'Unable to load reviews.')
      .then((data) => setReviews(data.reviews))
      .catch((cause: Error) => setError(cause.message))
  }

  async function decide(status: string, scope = 'internal') {
    setError('')
    try {
      await fetchApiJson(`/api/projects/${params.id}/reviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactKind: kind, status, scope, reason }),
      }, 'Unable to record review.')
      setReason('')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record review.')
    }
  }

  async function regenerate() {
    setError('')
    try {
      await fetchApiJson(`/api/projects/${params.id}/artifacts/${kind}/regenerate`, { method: 'POST' }, 'Unable to regenerate.')
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to regenerate.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Artifact review</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <Card className="mb-6">
        <CardHeader><CardTitle>Decide</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {['WORKFLOW', 'RELEASE', 'PROOF', 'KNOWLEDGE'].map((option) => (
            <Button key={option} variant={kind === option ? 'default' : 'outline'} size="sm" onClick={() => setKind(option)}>{option}</Button>
          ))}
          <input aria-label="Reason" className="flex h-9 w-full rounded-md border px-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Correction reason, author notes…" />
          <Button size="sm" onClick={() => void decide('APPROVED')}>Approve (internal)</Button>
          <Button size="sm" variant="outline" onClick={() => void decide('CHANGES_REQUESTED')}>Request changes</Button>
          <Button size="sm" variant="outline" onClick={() => void decide('REJECTED')}>Reject</Button>
          <Button size="sm" variant="secondary" onClick={() => void regenerate()}>Regenerate single artifact</Button>
        </CardContent>
      </Card>
      <div className="space-y-2 text-sm">
        {reviews.map((review) => (
          <div key={review.id} className="rounded border p-2">
            <span className="font-medium">{review.artifactKind}</span> · {review.status} · {review.scope}
            {review.stale && <span className="text-destructive"> · stale — baseline changed, re-review required</span>}
            {review.reason && <p className="text-muted-foreground">{review.reason}</p>}
          </div>
        ))}
        {reviews.length === 0 && <p className="text-muted-foreground">No reviews yet.</p>}
      </div>
    </div>
  )
}

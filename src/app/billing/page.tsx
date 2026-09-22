'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type Entitlement = { plan: string; revision: number; maxRunsPerDay: number; maxExportsPerDay: number; maxProjects: number; expiresAt?: string | null; suspended: boolean }

export default function BillingPage() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchApiJson<Entitlement>('/api/entitlement', undefined, 'Unable to load plan.')
      .then(setEntitlement)
      .catch((cause: Error) => setError(cause.message))
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Plan and billing</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {entitlement && (
        <Card>
          <CardHeader><CardTitle>Current plan: {entitlement.plan}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>Runs per day: {entitlement.maxRunsPerDay} · Exports per day: {entitlement.maxExportsPerDay} · Projects: {entitlement.maxProjects}</p>
            <p className="text-muted-foreground">State: {entitlement.suspended ? 'suspended' : entitlement.expiresAt ? `expires ${new Date(entitlement.expiresAt).toLocaleDateString()}` : 'active'} · revision {entitlement.revision}</p>
            <p className="text-muted-foreground">Existing data stays readable if the plan lapses; new paid work is blocked until the subscription is current. Manage subscription via the Customer Portal after checkout.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

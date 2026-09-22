'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type RepositoryOption = { id: string; fullName: string; private: boolean }

export function GitHubConnectionCard(props: {
  projectId: string
  status: string
  repositoryFullName?: string | null
  installationAccountLogin?: string | null
  installationAccountType?: string | null
  lastReconciledAt?: string | null
}) {
  const searchParams = useSearchParams()
  const [repositories, setRepositories] = useState<RepositoryOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadRepositories() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${props.projectId}/github-binding`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load GitHub repositories.')
      setRepositories(data.repositories)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load GitHub repositories.')
    } finally {
      setBusy(false)
    }
  }

  async function startConnection() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${props.projectId}/github-binding/start`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to start GitHub setup.')
      if (typeof data.installUrl !== 'string' || !data.installUrl.startsWith('https://github.com/apps/')) {
        throw new Error('GitHub setup returned an invalid destination.')
      }
      window.location.assign(data.installUrl)
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start GitHub setup.')
      setBusy(false)
    }
  }

  async function selectRepository(repositoryId: string) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${props.projectId}/github-binding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to connect repository.')
      window.history.replaceState(null, '', `/projects/${props.projectId}`)
      window.location.reload()
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Unable to connect repository.')
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${props.projectId}/github-binding`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to disconnect repository.')
      window.history.replaceState(null, '', `/projects/${props.projectId}`)
      window.location.reload()
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Unable to disconnect repository.')
      setBusy(false)
    }
  }

  const active = props.status === 'active'
  const setupResult = searchParams.get('githubSetup')
  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>GitHub App connection</CardTitle>
          <Badge variant={active ? 'default' : 'outline'}>{props.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {active ? (
          <div className="space-y-1 text-sm">
            <p><span className="font-medium">Repository:</span> {props.repositoryFullName}</p>
            <p><span className="font-medium">Installation:</span> {props.installationAccountLogin} ({props.installationAccountType})</p>
            {props.lastReconciledAt && <p className="text-muted-foreground">Verified {new Date(props.lastReconciledAt).toLocaleString()}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect through GitHub so Nexus Forge can verify your administrator authority and use a repository-scoped, read-only installation token.
          </p>
        )}

        {repositories.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Select a repository you administer</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {repositories.map((repository) => (
                <Button key={repository.id} variant="outline" disabled={busy} onClick={() => void selectRepository(repository.id)} className="justify-between">
                  <span className="truncate">{repository.fullName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{repository.private ? 'Private' : 'Public'}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {(error || setupResult === 'error') && (
          <p className="text-sm text-destructive">
            {error || 'GitHub did not confirm installation authority. Retry after the installation is approved.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!active && <Button disabled={busy} onClick={() => void startConnection()}>{busy ? 'Checking GitHub...' : 'Connect GitHub App'}</Button>}
          {setupResult === 'select' && <Button variant="outline" disabled={busy} onClick={() => void loadRepositories()}>Load approved repositories</Button>}
          {active && <Button variant="outline" disabled={busy} onClick={() => void startConnection()}>Change repository</Button>}
          {props.status !== 'unbound' && props.status !== 'disconnected' && (
            <Button variant="destructive" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

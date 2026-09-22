'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchApiJson } from '@/lib/client/api-response'

type ProjectConnection = { id: string; name: string; githubRepositoryFullName?: string | null; githubBindingStatus: string }

export default function ConnectionsPage() {
  const [projects, setProjects] = useState<ProjectConnection[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  async function load() {
    try {
      setProjects(await fetchApiJson<ProjectConnection[]>('/api/projects', undefined, 'Unable to load connections.'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load connections.')
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchApiJson<ProjectConnection[]>('/api/projects', undefined, 'Unable to load connections.')
      .then((data) => { if (!cancelled) setProjects(data) })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message) })
    return () => { cancelled = true }
  }, [])

  async function disconnect(projectId: string) {
    setBusy(projectId)
    setError('')
    try {
      await fetchApiJson(`/api/projects/${projectId}/github-binding`, { method: 'DELETE' }, 'Unable to disconnect.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to disconnect.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Repository connections</h1>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="space-y-3">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader><CardTitle className="text-base">{project.name}</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{project.githubRepositoryFullName ?? 'Not connected'} · {project.githubBindingStatus}</span>
              {project.githubBindingStatus === 'active' && (
                <Button variant="destructive" disabled={busy === project.id} onClick={() => void disconnect(project.id)}>Disconnect</Button>
              )}
            </CardContent>
          </Card>
        ))}
        {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ProjectSummary {
  id: string
  name: string
  goal: string
  status: string
  repoUrl: string
  repoAnalysis?: { maturityScore: number; scoreStatus: string; scoreCompleteness: number }
  proofPack?: { proofScore: number; scoreStatus: string; scoreCompleteness: number }
  releaseReport?: { releaseScore: number; scoreStatus: string; scoreCompleteness: number }
  _count: { sources: number }
  createdAt: string
  updatedAt: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch('/api/projects')
        if (response.status === 401) {
          window.location.assign(`/login?callbackURL=${encodeURIComponent('/projects')}`)
          return
        }
        if (!response.ok) throw new Error('Unable to load projects')
        const data: unknown = await response.json()
        if (!Array.isArray(data)) throw new Error('Invalid projects response')
        setProjects(data as ProjectSummary[])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load projects')
      } finally {
        setLoading(false)
      }
    }
    void loadProjects()
  }, [])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading projects...</div></div>
  if (error) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-destructive">{error}</div></div>

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
          <p className="text-muted-foreground mb-6">Create your first project to start building with Nexus Forge.</p>
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map(p => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      {p.goal && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{p.goal}</p>}
                    </div>
                    <Badge variant={p.status === "completed" ? "default" : p.status === "analyzing" ? "secondary" : "outline"}>
                      {p.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{p._count.sources} source(s)</span>
                    {p.repoUrl && <span className="truncate max-w-[200px]">{p.repoUrl}</span>}
                    {p.repoAnalysis && <span>Repository criteria: {p.repoAnalysis.scoreStatus === 'scored' ? `${p.repoAnalysis.maturityScore}/100` : 'unknown'} ({Math.round(p.repoAnalysis.scoreCompleteness * 100)}% complete)</span>}
                    {p.releaseReport && <span>Release criteria: {p.releaseReport.scoreStatus === 'scored' ? `${p.releaseReport.releaseScore}/100` : 'unknown'}</span>}
                    {p.proofPack && <span>Proof completeness: {p.proofPack.scoreStatus === 'scored' ? `${p.proofPack.proofScore}/100` : 'unknown'}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

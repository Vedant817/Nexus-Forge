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
  repoAnalysis?: { maturityScore: number }
  proofPack?: { proofScore: number }
  releaseReport?: { releaseScore: number }
  _count: { sources: number }
  createdAt: string
  updatedAt: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.json())
      .then(data => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading projects...</div></div>

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
                    {p.repoAnalysis && <span>Maturity: {p.repoAnalysis.maturityScore}/100</span>}
                    {p.releaseReport && <span>Release: {p.releaseReport.releaseScore}/100</span>}
                    {p.proofPack && <span>Proof: {p.proofPack.proofScore}/100</span>}
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

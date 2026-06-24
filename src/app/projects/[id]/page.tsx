"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, notFound as nextNotFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/ErrorBoundary"

interface ProjectDetail {
  id: string
  name: string
  goal: string
  repoUrl: string
  prUrl: string
  status: string
  sources: { id: string; type: string; title: string }[]
  knowledge: any
  repoAnalysis: any
  workflow: any
  releaseReport: any
  proofPack: any
  createdAt: string
  updatedAt: string
}

export default function ProjectPage() {
  const params = useParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [isNotFound, setIsNotFound] = useState(false)
  const [error, setError] = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${params.id}`)
      if (res.status === 404) { setIsNotFound(true); return }
      if (!res.ok) throw new Error("Failed to load")
      setProject(await res.json())
    } catch {
      setError("Failed to load project")
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { loadProject() }, [loadProject])

  useEffect(() => {
    if (project?.status === "analyzing") {
      pollRef.current = setInterval(() => {
        loadProject()
      }, 2000)
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (running) setRunning(false)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [project?.status, loadProject, running])

  if (isNotFound) nextNotFound()
  if (loading) return <LoadingSkeleton />
  if (!project) return <NotFoundState />

  const isAnalyzing = project.status === "analyzing"
  const canRunAnalysis = !isAnalyzing && !running && project.sources.length > 0

  const sections = [
    { href: `/projects/${project.id}/intake`, label: "Intake", desc: `${project.sources.length} source(s)`, ready: true },
    { href: `/projects/${project.id}/knowledge`, label: "Knowledge", desc: "Distilled learning", ready: !!project.knowledge },
    { href: `/projects/${project.id}/workflow`, label: "Workflow", desc: "Build tasks & prompts", ready: !!project.workflow },
    { href: `/projects/${project.id}/repo-review`, label: "Repo Review", desc: "Maturity analysis", ready: !!project.repoAnalysis },
    { href: `/projects/${project.id}/release`, label: "Release", desc: "Readiness report", ready: !!project.releaseReport },
    { href: `/projects/${project.id}/proof`, label: "Proof Pack", desc: "Portfolio output", ready: !!project.proofPack },
  ]

  return (
    <ErrorBoundary>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge variant={project.status === "completed" ? "default" : isAnalyzing ? "secondary" : "outline"}>
              {project.status}
            </Badge>
          </div>
          {project.goal && <p className="text-muted-foreground">{project.goal}</p>}
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            {project.repoUrl && <span className="truncate max-w-[300px]">Repo: {project.repoUrl}</span>}
            {project.prUrl && <span className="truncate max-w-[300px]">PR: {project.prUrl}</span>}
          </div>
        </div>

        {isAnalyzing && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="text-sm text-blue-700">Analysis in progress. Results will appear as they complete...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="mb-6 border-red-200">
            <CardContent className="pt-6">
              <p className="text-sm text-red-600">{error}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {sections.map(s => (
            <Link key={s.href} href={s.href}>
              <Card className={`hover:border-primary/50 transition-colors cursor-pointer h-full ${!s.ready ? "opacity-60" : ""}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                  {!s.ready && project.status === "completed" && <Badge variant="outline" className="mt-2">No data</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {canRunAnalysis && (
          <div className="flex justify-center">
            <Button
              onClick={async () => {
                setRunning(true)
                setError("")
                try {
                  const res = await fetch(`/api/projects/${project.id}/run-analysis`, { method: "POST" })
                  if (!res.ok) {
                    const data = await res.json()
                    setError(data.error || "Analysis failed")
                    setRunning(false)
                    return
                  }
                  loadProject()
                } catch {
                  setError("Failed to start analysis")
                  setRunning(false)
                }
              }}
            >
              Run Analysis
            </Button>
          </div>
        )}

        {running && !isAnalyzing && (
          <div className="flex justify-center mt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Starting analysis...
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}

function LoadingSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="h-9 w-64 animate-pulse rounded bg-muted mb-2" />
        <div className="h-5 w-96 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    </div>
  )
}

function NotFoundState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Project not found</h2>
        <p className="text-muted-foreground mb-6">This project doesn&apos;t exist or has been deleted.</p>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to projects
        </Link>
      </div>
    </div>
  )
}

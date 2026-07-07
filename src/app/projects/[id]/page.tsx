"use client"

import { useEffect, useState } from "react"
import { useParams, notFound as nextNotFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

interface ProjectDetail {
  id: string
  name: string
  goal: string
  repoUrl: string
  prUrl: string
  status: string
  sources: { id: string; type: string; title: string }[]
  knowledge: Record<string, unknown> | null
  repoAnalysis: Record<string, unknown> | null
  workflow: Record<string, unknown> | null
  releaseReport: Record<string, unknown> | null
  proofPack: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export default function ProjectPage() {
  const params = useParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [optimisticAnalyzing, setOptimisticAnalyzing] = useState(false)
  const [isNotFound, setIsNotFound] = useState(false)
  const [error, setError] = useState("")

  const isAnalyzing = project?.status.startsWith("analyzing") || optimisticAnalyzing
  const canRunAnalysis = !isAnalyzing && !optimisticAnalyzing && (project?.sources?.length ?? 0) > 0

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then(res => {
        if (res.status === 404) { setIsNotFound(true); return null }
        if (!res.ok) throw new Error("Failed to load")
        return res.json()
      })
      .then(data => { if (data) { setProject(data); if (!data.status.startsWith("analyzing")) setOptimisticAnalyzing(false) } })
      .catch(() => setError("Failed to load project"))
      .finally(() => setLoading(false))
  }, [params.id])

  useEffect(() => {
    let id: ReturnType<typeof setInterval>
    if (isAnalyzing) {
      id = setInterval(() => {
        fetch(`/api/projects/${params.id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => { 
            if (data) { 
              setProject(data)
              if (!data.status.startsWith("analyzing")) {
                setOptimisticAnalyzing(false)
                clearInterval(id)
              }
            } 
          })
      }, 2000)
    }
    return () => {
      if (id) clearInterval(id)
    }
  }, [isAnalyzing, params.id])

  if (isNotFound) nextNotFound()
  if (loading) return <LoadingSkeleton />
  if (!project) return <NotFoundState />

  const sections = [
    { href: `/projects/${project.id}/intake`, label: "Intake", desc: `${project.sources.length} source(s)`, ready: true, emptyText: "" },
    { href: `/projects/${project.id}/knowledge`, label: "Knowledge", desc: "Distilled learning", ready: !!project.knowledge, emptyText: "No data" },
    { href: `/projects/${project.id}/workflow`, label: "Workflow", desc: "Build tasks & prompts", ready: !!project.workflow, emptyText: "No data" },
    { href: `/projects/${project.id}/repo-review`, label: "Repo Review", desc: "Maturity analysis", ready: !!project.repoAnalysis, emptyText: !project.repoUrl ? "Requires Repo URL" : "No data" },
    { href: `/projects/${project.id}/release`, label: "Release", desc: "Readiness report", ready: !!project.releaseReport, emptyText: !project.prUrl ? "Requires PR URL" : "No data" },
    { href: `/projects/${project.id}/proof`, label: "Proof Pack", desc: "Portfolio output", ready: !!project.proofPack, emptyText: "No data" },
  ]

  const chartData = []
  if (project.repoAnalysis && typeof project.repoAnalysis === 'object' && 'maturityScore' in project.repoAnalysis && typeof project.repoAnalysis.maturityScore === 'number') {
    chartData.push({ name: 'Maturity', score: project.repoAnalysis.maturityScore })
  }
  if (project.proofPack && typeof project.proofPack === 'object' && 'proofScore' in project.proofPack && typeof project.proofPack.proofScore === 'number') {
    chartData.push({ name: 'Proof', score: project.proofPack.proofScore })
  }

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
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <p className="font-semibold text-blue-900">Analysis in progress...</p>
                </div>
                <div className="pl-8 space-y-3">
                  <StepIndicator status={project?.status} stepStatus="analyzing:knowledge" label="Distilling Knowledge" />
                  <StepIndicator status={project?.status} stepStatus="analyzing:repo" label="Analyzing Repository Context" />
                  <StepIndicator status={project?.status} stepStatus="analyzing:workflow" label="Planning Build Workflow" />
                  <StepIndicator status={project?.status} stepStatus="analyzing:release" label="Evaluating Release Readiness" />
                  <StepIndicator status={project?.status} stepStatus="analyzing:proof" label="Generating Proof of Work" />
                </div>
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
                  {!s.ready && project.status === "completed" && <Badge variant="outline" className="mt-2">{s.emptyText}</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {chartData.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Project Scores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {canRunAnalysis && (
          <div className="flex justify-center">
            <Button
              onClick={async () => {
                setOptimisticAnalyzing(true)
                setError("")
                try {
                  const res = await fetch(`/api/projects/${project.id}/run-analysis`, { method: "POST" })
                  if (!res.ok) {
                    const data = await res.json()
                    setError(data.error || "Analysis failed")
                    setOptimisticAnalyzing(false)
                    return
                  }
                } catch {
                  setError("Failed to start analysis")
                  setOptimisticAnalyzing(false)
                }
              }}
            >
              Run Analysis
            </Button>
          </div>
        )}

        {optimisticAnalyzing && !isAnalyzing && (
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

function StepIndicator({ status, stepStatus, label }: { status?: string, stepStatus: string, label: string }) {
  const steps = [
    "analyzing", 
    "analyzing:knowledge", 
    "analyzing:repo", 
    "analyzing:workflow", 
    "analyzing:release", 
    "analyzing:proof"
  ]
  const currentIndex = steps.indexOf(status || "analyzing")
  const stepIndex = steps.indexOf(stepStatus)
  
  const isCompleted = currentIndex > stepIndex
  const isCurrent = currentIndex === stepIndex

  return (
    <div className="flex items-center gap-3">
      {isCompleted ? (
        <div className="h-4 w-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : isCurrent ? (
        <div className="h-4 w-4 animate-pulse rounded-full bg-blue-400 shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-blue-200 shrink-0" />
      )}
      <p className={`text-sm ${isCurrent ? "text-blue-900 font-medium" : isCompleted ? "text-blue-700" : "text-blue-400"}`}>
        {label}
      </p>
    </div>
  )
}

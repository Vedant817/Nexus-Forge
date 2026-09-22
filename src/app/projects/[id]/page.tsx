"use client"

import { Suspense, useEffect, useState } from "react"
import { useParams, notFound as nextNotFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { GitHubConnectionCard } from "@/components/github-connection-card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

interface AnalysisRunView {
  id: string
  status: string
  attemptCount: number
  failureClass?: string | null
  failureCode?: string | null
  failureMessage?: string | null
  queuedAt?: string
  startedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  stages: {
    stage: string
    status: string
    attemptCount: number
    failureClass?: string | null
    failureCode?: string | null
    failureMessage?: string | null
    startedAt?: string | null
    completedAt?: string | null
  }[]
}

interface ProjectDetail {
  id: string
  name: string
  goal: string
  repoUrl: string
  prUrl: string
  status: string
  githubRepositoryFullName?: string | null
  githubBindingStatus: string
  githubInstallationAccountLogin?: string | null
  githubInstallationAccountType?: string | null
  githubBindingLastReconciledAt?: string | null
  sources: { id: string; type: string; title: string }[]
  knowledge: Record<string, unknown> | null
  repoAnalysis: Record<string, unknown> | null
  workflow: Record<string, unknown> | null
  releaseReport: Record<string, unknown> | null
  proofPack: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  analysisRuns?: AnalysisRunView[]
}

export default function ProjectPage() {
  const params = useParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [optimisticAnalyzing, setOptimisticAnalyzing] = useState(false)
  const [isNotFound, setIsNotFound] = useState(false)
  const [error, setError] = useState("")
  const [run, setRun] = useState<AnalysisRunView | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const runIsTerminal = Boolean(run && ["SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status))
  const isAnalyzing = (run ? !runIsTerminal : Boolean(project?.status.startsWith("analyzing"))) || optimisticAnalyzing
  const canRunAnalysis = !isAnalyzing && ((project?.sources?.length ?? 0) > 0 || Boolean(project?.repoUrl))

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then(res => {
        if (res.status === 404) { setIsNotFound(true); return null }
        if (!res.ok) throw new Error("Failed to load")
        return res.json()
      })
      .then(data => {
        if (data) {
          setProject(data)
          const activeRun = data.analysisRuns?.find((candidate: AnalysisRunView) => !["SUCCEEDED", "FAILED", "CANCELLED"].includes(candidate.status))
          setRun(activeRun ?? data.analysisRuns?.[0] ?? null)
          setOptimisticAnalyzing(Boolean(activeRun) || data.status.startsWith("analyzing"))
        }
      })
      .catch(() => setError("Failed to load project"))
      .finally(() => setLoading(false))
  }, [params.id])

  useEffect(() => {
    if (!run?.id || !isAnalyzing) return
    let stopped = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const scheduleRetry = () => {
      if (stopped) return
      failures += 1
      setError("Temporarily unable to refresh analysis status; retrying…")
      timer = setTimeout(poll, Math.min(15_000, 1_000 * 2 ** Math.min(failures, 4)))
    }

    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${params.id}/runs/${run.id}`)
        if (response.status === 404) {
          stopped = true
          setOptimisticAnalyzing(false)
          setError("The active analysis run is no longer available.")
          return
        }
        if (!response.ok) {
          scheduleRetry()
          return
        }
        const nextRun = await response.json() as AnalysisRunView
        if (stopped) return
        failures = 0
        setError("")
        setRun(nextRun)
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(nextRun.status)) {
          stopped = true
          setOptimisticAnalyzing(false)
          setCancelling(false)
          if (nextRun.failureMessage) setError(`${nextRun.failureClass ?? "Analysis failure"}: ${nextRun.failureMessage}`)
          setProject((current) => current ? {
            ...current,
            status: nextRun.status === "SUCCEEDED" ? "completed" : nextRun.status === "CANCELLED" ? "cancelled" : "error",
            analysisRuns: [nextRun, ...(current.analysisRuns ?? []).filter((candidate) => candidate.id !== nextRun.id)],
          } : current)
          try {
            const projectResponse = await fetch(`/api/projects/${params.id}`)
            if (!projectResponse.ok) throw new Error('Project refresh failed')
            setProject(await projectResponse.json())
          } catch {
            setError((current) => current || "The run finished, but project history could not be refreshed. Reload to retry.")
          }
          return
        }
        timer = setTimeout(poll, 2000)
      } catch {
        scheduleRetry()
      }
    }
    timer = setTimeout(poll, 250)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [isAnalyzing, params.id, run?.id])

  if (isNotFound) nextNotFound()
  if (loading) return <LoadingSkeleton />
  if (!project) return <NotFoundState />

  const sections = [
    { href: `/projects/${project.id}/intake`, label: "Intake", desc: `${project.sources.length} source(s)`, ready: true, emptyText: "" },
    { href: `/projects/${project.id}/knowledge`, label: "Knowledge", desc: "Distilled learning", ready: !!project.knowledge, emptyText: "No data" },
    { href: `/projects/${project.id}/repo-review`, label: "Repo Review", desc: "Maturity analysis", ready: !!project.repoAnalysis, emptyText: !project.repoUrl ? "Requires Repo URL" : "No data" },
    { href: `/projects/${project.id}/architecture`, label: "Architecture", desc: "Living codebase map", ready: !!project.repoAnalysis, emptyText: "Requires Repo Review" },
    { href: `/projects/${project.id}/workflow`, label: "Workflow", desc: "Build tasks & prompts", ready: !!project.workflow, emptyText: "No data" },
    { href: `/projects/${project.id}/release`, label: "Release", desc: "Readiness report", ready: !!project.releaseReport, emptyText: !project.prUrl ? "Requires PR URL" : "No data" },
    { href: `/projects/${project.id}/proof`, label: "Proof Pack", desc: "Portfolio output", ready: !!project.proofPack, emptyText: "No data" },
  ]

  const chartData = []
  if (project.repoAnalysis && typeof project.repoAnalysis === 'object' && 'maturityScore' in project.repoAnalysis && 'scoreStatus' in project.repoAnalysis && project.repoAnalysis.scoreStatus === 'scored' && typeof project.repoAnalysis.maturityScore === 'number') {
    chartData.push({ name: 'Repository criteria', score: project.repoAnalysis.maturityScore })
  }
  if (project.proofPack && typeof project.proofPack === 'object' && 'proofScore' in project.proofPack && 'scoreStatus' in project.proofPack && project.proofPack.scoreStatus === 'scored' && typeof project.proofPack.proofScore === 'number') {
    chartData.push({ name: 'Proof completeness', score: project.proofPack.proofScore })
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
                  {(run?.stages ?? []).map(stage => (
                    <div key={stage.stage} className="text-sm text-blue-900">
                      <span className="font-medium">{stage.stage}</span>: {stage.status} (attempt {stage.attemptCount})
                      {stage.failureMessage && <span className="block text-red-700">{stage.failureMessage}</span>}
                    </div>
                  ))}
                  {run && !["SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelling || run.status === "CANCEL_REQUESTED"}
                      onClick={async () => {
                        setCancelling(true)
                        setError("")
                        try {
                          const response = await fetch(`/api/projects/${project.id}/runs/${run.id}/cancel`, { method: "POST" })
                          const data = await response.json()
                          if (!response.ok) {
                            setError(data.error || "Unable to cancel analysis.")
                            setCancelling(false)
                            return
                          }
                          setRun((current) => current ? { ...current, status: "CANCEL_REQUESTED" } : current)
                        } catch {
                          setError("Unable to cancel analysis.")
                          setCancelling(false)
                        }
                      }}
                    >
                      {cancelling || run.status === "CANCEL_REQUESTED" ? "Cancellation requested" : "Cancel analysis"}
                    </Button>
                  )}
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

        {project.analysisRuns && project.analysisRuns.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Run history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.analysisRuns.map((historyRun) => {
                const failedStage = historyRun.stages.find((stage) => stage.status === "FAILED")
                const terminalFailure = historyRun.status === "FAILED"
                return (
                  <div key={historyRun.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={terminalFailure ? "destructive" : historyRun.status === "SUCCEEDED" ? "default" : "outline"}>{historyRun.status}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{historyRun.id.slice(0, 12)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {historyRun.completedAt ? new Date(historyRun.completedAt).toLocaleString() : historyRun.queuedAt ? new Date(historyRun.queuedAt).toLocaleString() : "Queued"}
                      </span>
                    </div>
                    {terminalFailure && (
                      <div className="mt-3 space-y-1 text-sm">
                        <p className="font-medium text-destructive">{historyRun.failureCode ?? historyRun.failureClass ?? "AnalysisFailure"}</p>
                        <p className="text-muted-foreground">{historyRun.failureMessage ?? "The run ended before all stages completed."}</p>
                        {failedStage && <p className="text-muted-foreground">Failed stage: {failedStage.stage} · {failedStage.failureCode ?? failedStage.failureClass ?? "unknown"}</p>}
                        <p>{recoveryGuidance(historyRun)}</p>
                      </div>
                    )}
                    <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
                      {historyRun.stages.map((stage) => (
                        <div key={stage.stage} className="rounded bg-muted/50 px-2 py-1 text-xs">
                          <span className="font-medium">{stage.stage}</span>: {stage.status}
                          {stage.failureCode && <span className="block text-destructive">{stage.failureCode}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        <Suspense fallback={null}>
          <GitHubConnectionCard
            projectId={project.id}
            status={project.githubBindingStatus}
            repositoryFullName={project.githubRepositoryFullName}
            installationAccountLogin={project.githubInstallationAccountLogin}
            installationAccountType={project.githubInstallationAccountType}
            lastReconciledAt={project.githubBindingLastReconciledAt}
          />
        </Suspense>

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
                  const data = await res.json()
                  if (!res.ok) {
                    if (res.status === 409 && data.runId) {
                      setRun({ id: data.runId, status: data.status ?? "QUEUED", attemptCount: 0, stages: [] })
                      setOptimisticAnalyzing(true)
                      return
                    }
                    setError(data.error || "Analysis failed")
                    setOptimisticAnalyzing(false)
                    return
                  }
                  if (!data.runId || typeof data.status !== "string") {
                    throw new Error("Analysis start returned an invalid response.")
                  }
                  setRun({ id: data.runId, status: data.status, attemptCount: 0, stages: [] })
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Failed to start analysis")
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

function recoveryGuidance(run: AnalysisRunView): string {
  const code = `${run.failureCode ?? ""} ${run.failureClass ?? ""}`.toLowerCase()
  if (code.includes("github") || code.includes("repository")) return "Reconnect or reconcile the GitHub App, then retry the run."
  if (code.includes("rate") || code.includes("transient") || code.includes("lease")) return "This appears temporary. Wait briefly, then retry the run."
  if (code.includes("validation") || code.includes("input")) return "Review the project intake and generated-input limits before retrying."
  return "Review the failed stage, update the project inputs if needed, then retry. Contact an administrator if the same code repeats."
}

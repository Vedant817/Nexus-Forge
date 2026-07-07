"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ReleasePageData {
  releaseScore: number
  decision: string
  releaseNotesDraft: string
  topRisks: string
  missingTests: string
  missingDocs: string
  configOrEnvIssues: string
  releaseChecklist: string
  recommendedFixesBeforeMerge: string
}

export default function ReleasePage() {
  const params = useParams()
  const [data, setData] = useState<ReleasePageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/release-report`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No release report yet. Add a PR URL and run analysis.</div></div>

  const risks = safeParse(data.topRisks) as string[]
  const missingTests = safeParse(data.missingTests) as string[]
  const missingDocs = safeParse(data.missingDocs) as string[]
  const configIssues = safeParse(data.configOrEnvIssues) as string[]
  const checklist = safeParse(data.releaseChecklist) as string[]
  const fixes = safeParse(data.recommendedFixesBeforeMerge) as string[]

  const decisionColor = data.decision === "go" ? "text-green-600" : data.decision === "go_with_fixes" ? "text-yellow-600" : "text-red-600"
  const decisionLabel = data.decision === "go" ? "Go" : data.decision === "go_with_fixes" ? "Go with Fixes" : "No Go"

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Release Readiness Report</h1>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Release Score</CardTitle></CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{data.releaseScore}/100</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Decision</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${decisionColor}`}>{decisionLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Release Notes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
              {data.releaseNotesDraft}
            </div>
          </CardContent>
        </Card>
      </div>

      {risks.length > 0 && (
        <Card className="mb-6 border-red-200">
          <CardHeader><CardTitle className="text-red-600">Top Risks</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {risks.map((r: string, i: number) => <li key={i} className="text-sm">{r}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {missingTests.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Missing Tests</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc pl-4 space-y-1">
                {missingTests.map((t: string, i: number) => <li key={i} className="text-sm">{t}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}
        {missingDocs.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Missing Docs</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc pl-4 space-y-1">
                {missingDocs.map((d: string, i: number) => <li key={i} className="text-sm">{d}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}
        {configIssues.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Config Issues</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc pl-4 space-y-1">
                {configIssues.map((c: string, i: number) => <li key={i} className="text-sm">{c}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Release Checklist</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {checklist.map((c: string, i: number) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="mt-0.5">☐</span> {c}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {fixes.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Fixes Before Merge</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {fixes.map((f: string, i: number) => <li key={i} className="text-sm">{f}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function safeParse(json: string): unknown[] {
  try { return JSON.parse(json) as unknown[] } catch { return [] }
}

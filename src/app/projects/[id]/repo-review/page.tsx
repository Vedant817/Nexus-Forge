"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function RepoReviewPage() {
  const params = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/repo-analysis`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No repo analysis yet. Add a repo URL and run analysis.</div></div>

  const stack = safeParse(data.detectedStack)
  const missing = safeParse(data.missingItems)
  const risks = safeParse(data.risks)
  const fixes = safeParse(data.recommendedFixes)
  const files = safeParse(data.importantFiles)

  const scoreColor = data.maturityScore >= 70 ? "text-green-600" : data.maturityScore >= 40 ? "text-yellow-600" : "text-red-600"

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Repository Review</h1>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Maturity Score</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-4xl font-bold ${scoreColor}`}>{data.maturityScore}/100</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-lg">Detected Stack</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stack.map((s: string, i: number) => <Badge key={i}>{s}</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Architecture</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{data.architectureSummary}</p>
            {files.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-semibold mb-1">Important Files:</p>
                <ul className="list-disc pl-4 text-sm space-y-0.5">
                  {files.map((f: string, i: number) => <li key={i} className="font-mono text-xs">{f}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Setup Quality</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{data.setupQuality}</p>
          </CardContent>
        </Card>
      </div>

      {missing.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Missing Items</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {missing.map((m: string, i: number) => <li key={i} className="text-sm">{m}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {risks.length > 0 && (
        <Card className="mb-6 border-red-200">
          <CardHeader><CardTitle className="text-red-600">Risks</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {risks.map((r: string, i: number) => <li key={i} className="text-sm">{r}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {fixes.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recommended Fixes</CardTitle></CardHeader>
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

function safeParse(json: string): any[] {
  try { return JSON.parse(json) } catch { return [] }
}

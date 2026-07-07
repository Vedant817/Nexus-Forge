"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface BuildableTask {
  title: string
  description: string
  evidence?: string
}

interface KnowledgePageData {
  mainTopic: string
  keyConcepts: string
  implementationPatterns: string
  buildableTasks: string
  warningsOrPitfalls: string
  termsToUnderstand: string
  sourceEvidence: string
  recommendedNextAction?: string
}

export default function KnowledgePage() {
  const params = useParams()
  const [data, setData] = useState<KnowledgePageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/knowledge`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No knowledge summary yet. Run analysis first.</div></div>

  const concepts = safeParse(data.keyConcepts) as string[]
  const patterns = safeParse(data.implementationPatterns) as string[]
  const tasks = safeParse(data.buildableTasks) as BuildableTask[]
  const warnings = safeParse(data.warningsOrPitfalls) as string[]
  const terms = safeParse(data.termsToUnderstand) as string[]
  const evidence = safeParse(data.sourceEvidence) as string[]

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Knowledge Summary</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Main Topic</CardTitle></CardHeader>
        <CardContent>
          <p className="text-lg">{data.mainTopic}</p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Key Concepts</CardTitle></CardHeader>
          <CardContent>
            {concepts.length > 0 ? (
              <ul className="list-disc pl-4 space-y-1 text-sm">
                {concepts.map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No concepts identified</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Implementation Patterns</CardTitle></CardHeader>
          <CardContent>
            {patterns.length > 0 ? (
              <ul className="list-disc pl-4 space-y-1 text-sm">
                {patterns.map((p: string, i: number) => <li key={i}>{p}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No patterns identified</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Buildable Tasks</CardTitle></CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <div className="space-y-3">
              {tasks.map((t: BuildableTask, i: number) => (
                <div key={i} className="p-3 rounded-md border">
                  <h3 className="font-medium">{t.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                  {t.evidence && <p className="text-xs text-muted-foreground mt-1 italic">Evidence: {t.evidence}</p>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No tasks extracted</p>}
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <Alert className="mb-6">
          <AlertDescription>
            <strong>Warnings:</strong>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              {warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Terms to Understand</CardTitle></CardHeader>
          <CardContent>
            {terms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {terms.map((t: string, i: number) => <Badge key={i} variant="secondary">{t}</Badge>)}
              </div>
            ) : <p className="text-sm text-muted-foreground">No terms identified</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Source Evidence</CardTitle></CardHeader>
          <CardContent>
            {evidence.length > 0 ? (
              <ul className="list-disc pl-4 space-y-1 text-sm">
                {evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No sources cited</p>}
          </CardContent>
        </Card>
      </div>

      {data.recommendedNextAction && (
        <Card>
          <CardHeader><CardTitle>Recommended Next Action</CardTitle></CardHeader>
          <CardContent>
            <p>{data.recommendedNextAction}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function safeParse(json: string): unknown[] {
  try { return JSON.parse(json) as unknown[] } catch { return [] }
}

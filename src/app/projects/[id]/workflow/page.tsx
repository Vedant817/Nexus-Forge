"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function WorkflowPage() {
  const params = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/workflow`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No workflow yet. Run analysis first.</div></div>

  const tasks = safeParse(data.tasksJson)
  const criteria = safeParse(data.acceptanceCriteria)
  const files = safeParse(data.expectedFiles)

  const columns = ["planned", "in_progress", "needs_review", "done"]
  const columnLabels: Record<string, string> = {
    planned: "Planned",
    in_progress: "In Progress",
    needs_review: "Needs Review",
    done: "Done",
  }

  function copyPrompt(prompt: string) {
    navigator.clipboard.writeText(prompt)
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Workflow Board</h1>
          <p className="text-muted-foreground mt-1">{data.title}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            window.open(`/api/projects/${params.id}/export/workflow.md`, "_blank")
          }}
        >
          Export Markdown
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Objective</h3>
          <p className="text-sm text-muted-foreground">{data.objective}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {columns.map(col => (
          <div key={col}>
            <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide text-muted-foreground">
              {columnLabels[col]}
            </h3>
            <div className="space-y-3">
              {tasks.filter((t: any) => t.status === col).map((task: any) => (
                <Card key={task.id} className="border-l-4" style={{
                  borderLeftColor: task.priority === "critical" ? "var(--destructive)" : task.priority === "high" ? "#f59e0b" : "#6366f1",
                }}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="text-sm font-medium">{task.title}</h4>
                      <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      <strong>Reason:</strong> {task.reason}
                    </p>
                    {task.acceptanceCriteria?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold">AC:</p>
                        {task.acceptanceCriteria.map((ac: string, i: number) => (
                          <p key={i} className="text-[10px] text-muted-foreground">- {ac}</p>
                        ))}
                      </div>
                    )}
                    {task.suggestedAgentPrompt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[10px] h-6"
                        onClick={() => copyPrompt(task.suggestedAgentPrompt)}
                      >
                        Copy Prompt
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Acceptance Criteria</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {criteria.map((c: string, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-1">☐</span> {c}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {files.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Expected Files to Change</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {files.map((f: string, i: number) => (
                  <li key={i} className="text-sm font-mono">- {f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function safeParse(json: string): any[] {
  try { return JSON.parse(json) } catch { return [] }
}

"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface WorkflowTask {
  id: string
  title: string
  status: string
  priority: string
  description: string
  reason: string
  acceptanceCriteria: string[]
  suggestedAgentPrompt: string
}

interface WorkflowPageData {
  title: string
  objective: string
  tasksJson: string
  acceptanceCriteria: string
  expectedFiles: string
}

export default function WorkflowPage() {
  const params = useParams()
  const [data, setData] = useState<WorkflowPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/workflow`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No workflow yet. Run analysis first.</div></div>

  const tasks = safeParse(data.tasksJson) as WorkflowTask[]
  const criteria = safeParse(data.acceptanceCriteria) as string[]
  const files = safeParse(data.expectedFiles) as string[]

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
    <div className="container mx-auto px-4 py-8 max-w-[1400px]">
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {columns.map(col => (
          <div key={col} className="flex flex-col h-[650px] bg-slate-50/50 rounded-xl border p-4">
            <h3 className="font-semibold text-sm mb-4 uppercase tracking-wide text-muted-foreground flex items-center justify-between">
              {columnLabels[col]}
              <Badge variant="secondary" className="rounded-full w-6 h-6 flex items-center justify-center p-0">
                {tasks.filter((t) => t.status === col).length}
              </Badge>
            </h3>
            
            <div className="space-y-3 overflow-y-auto pr-2 pb-4 -mr-2">
              {tasks.filter((t: WorkflowTask) => t.status === col).map((task: WorkflowTask) => (
                <Card 
                  key={task.id} 
                  className="border-l-4 cursor-pointer hover:shadow-md transition-shadow group bg-white"
                  style={{
                    borderLeftColor: task.priority === "critical" ? "var(--destructive)" : task.priority === "high" ? "#f59e0b" : "#6366f1",
                  }}
                  onClick={() => setSelectedTask(task)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-medium leading-snug group-hover:text-blue-600 transition-colors">{task.title}</h4>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase mb-3 bg-slate-50">{task.priority}</Badge>
                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{task.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Project Acceptance Criteria</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {criteria.map((c: string, i: number) => (
                <li key={i} className="text-sm flex items-start gap-3 text-muted-foreground">
                  <span className="mt-0.5 w-4 h-4 rounded-full border border-primary/50 flex-shrink-0" /> 
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {files.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Expected Files to Change</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 bg-slate-50 p-4 rounded-lg">
                {files.map((f: string, i: number) => (
                  <li key={i} className="text-sm font-mono text-muted-foreground">{f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Task Details Sidebar (Sheet) */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedTask(null)}
          />
          
          {/* Slide-out Panel */}
          <div className="relative w-full max-w-lg bg-background h-full shadow-2xl flex flex-col border-l animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="uppercase bg-slate-50">{selectedTask.status.replace("_", " ")}</Badge>
                <Badge 
                  style={{ backgroundColor: selectedTask.priority === "critical" ? "var(--destructive)" : selectedTask.priority === "high" ? "#f59e0b" : "#6366f1", color: "white" }} 
                  className="uppercase"
                >
                  {selectedTask.priority}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedTask(null)}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2 leading-tight">{selectedTask.title}</h2>
                <p className="text-muted-foreground">{selectedTask.description}</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reasoning</h4>
                <p className="text-sm">{selectedTask.reason}</p>
              </div>

              {selectedTask.acceptanceCriteria?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Acceptance Criteria</h4>
                  <ul className="space-y-2">
                    {selectedTask.acceptanceCriteria.map((ac, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-0.5 w-3 h-3 rounded-full border border-primary/40 flex-shrink-0" />
                        <span>{ac}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.suggestedAgentPrompt && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">AI Agent Prompt</h4>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={() => copyPrompt(selectedTask.suggestedAgentPrompt)}
                      className="text-xs h-7"
                    >
                      Copy Prompt
                    </Button>
                  </div>
                  <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedTask.suggestedAgentPrompt}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function safeParse(json: string): unknown[] {
  try { return JSON.parse(json) as unknown[] } catch { return [] }
}

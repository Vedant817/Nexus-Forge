"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { Trash2, CheckCircle2, Circle } from "lucide-react"

interface WorkflowTask {
  id: string
  title: string
  status: string
  priority: string
  description: string
  reason: string
  acceptanceCriteria: string[]
  completedAcIndices?: number[]
  suggestedAgentPrompt: string
}

interface WorkflowPageData {
  title: string
  objective: string
  tasksJson: string
  acceptanceCriteria: string
  completedAcceptanceCriteria: string
  expectedFiles: string
}

export default function WorkflowPage() {
  const params = useParams()
  const [data, setData] = useState<WorkflowPageData | null>(null)
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [completedProjectAcIndices, setCompletedProjectAcIndices] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/workflow`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setTasks(safeParse(d.tasksJson) as WorkflowTask[])
        setCompletedProjectAcIndices(safeParse(d.completedAcceptanceCriteria) as number[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No workflow yet. Run analysis first.</div></div>

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

  async function saveTasks(newTasks: WorkflowTask[]) {
    setSaving(true)
    try {
      await fetch(`/api/projects/${params.id}/workflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasksJson: JSON.stringify(newTasks) })
      })
    } catch (e) {
      console.error("Failed to save tasks", e)
    } finally {
      setSaving(false)
    }
  }

  function onDragEnd(result: DropResult) {
    const { source, destination } = result
    if (!destination) return

    const sourceCol = source.droppableId
    const destCol = destination.droppableId

    if (sourceCol === destCol && source.index === destination.index) return

    const newTasks = Array.from(tasks)
    
    // Find task in full array
    const sourceTasks = newTasks.filter(t => t.status === sourceCol)
    const movedTask = sourceTasks[source.index]
    
    // Update its status
    movedTask.status = destCol

    if (sourceCol === destCol) {
      // Reordering in the same column
      const nonAffectedTasks = newTasks.filter(t => t.status !== sourceCol)
      const columnTasks = Array.from(sourceTasks)
      columnTasks.splice(source.index, 1)
      columnTasks.splice(destination.index, 0, movedTask)
      
      const finalTasks = [...nonAffectedTasks, ...columnTasks]
      setTasks(finalTasks)
      saveTasks(finalTasks)
    } else {
      // Moving to a different column
      const nonAffectedTasks = newTasks.filter(t => t.status !== sourceCol && t.status !== destCol)
      const newSourceTasks = sourceTasks.filter(t => t.id !== movedTask.id)
      const newDestTasks = newTasks.filter(t => t.status === destCol)
      newDestTasks.splice(destination.index, 0, movedTask)
      
      const finalTasks = [...nonAffectedTasks, ...newSourceTasks, ...newDestTasks]
      setTasks(finalTasks)
      saveTasks(finalTasks)
    }
  }

  function toggleAc(taskId: string, index: number) {
    const newTasks = tasks.map(t => {
      if (t.id === taskId) {
        const completed = t.completedAcIndices || []
        const isDone = completed.includes(index)
        const newCompleted = isDone ? completed.filter(i => i !== index) : [...completed, index]
        const updatedTask = { ...t, completedAcIndices: newCompleted }
        if (selectedTask?.id === taskId) setSelectedTask(updatedTask)
        return updatedTask
      }
      return t
    })
    setTasks(newTasks)
    saveTasks(newTasks)
  }

  function deleteTask(taskId: string) {
    const newTasks = tasks.filter(t => t.id !== taskId)
    setTasks(newTasks)
    setSelectedTask(null)
    saveTasks(newTasks)
  }

  async function toggleProjectAc(index: number) {
    const isDone = completedProjectAcIndices.includes(index)
    const newIndices = isDone 
      ? completedProjectAcIndices.filter(i => i !== index)
      : [...completedProjectAcIndices, index]
    
    setCompletedProjectAcIndices(newIndices)
    setSaving(true)
    try {
      await fetch(`/api/projects/${params.id}/workflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedAcceptanceCriteria: JSON.stringify(newIndices) })
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Workflow Board</h1>
          {saving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
        </div>
        <Button
          variant="outline"
          onClick={() => {
            window.open(`/api/projects/${params.id}/export/workflow`, "_blank")
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

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {columns.map(col => {
            const colTasks = tasks.filter(t => t.status === col)
            return (
              <div key={col} className="flex flex-col h-[650px] bg-slate-50/50 rounded-xl border p-4">
                <h3 className="font-semibold text-sm mb-4 uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                  {columnLabels[col]}
                  <Badge variant="secondary" className="rounded-full w-6 h-6 flex items-center justify-center p-0">
                    {colTasks.length}
                  </Badge>
                </h3>
                
                <Droppable droppableId={col}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.droppableProps}
                      className="space-y-3 overflow-y-auto pr-2 pb-4 h-full"
                    >
                      {colTasks.map((task: WorkflowTask, index: number) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <Card 
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
                                  
                                  {task.acceptanceCriteria?.length > 0 && (
                                    <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {task.completedAcIndices?.length || 0} / {task.acceptanceCriteria.length} AC
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Project Acceptance Criteria
              <span className="text-sm font-normal text-muted-foreground">
                {completedProjectAcIndices.length} / {criteria.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4 -mt-2">
              These are the global requirements for this workflow. Check them off as you complete the project.
            </p>
            <ul className="space-y-2">
              {criteria.map((c: string, i: number) => {
                const isDone = completedProjectAcIndices.includes(i)
                return (
                  <li 
                    key={i} 
                    className="text-sm flex items-start gap-3 text-muted-foreground cursor-pointer hover:bg-slate-50 p-2 rounded-md transition-colors"
                    onClick={() => toggleProjectAc(i)}
                  >
                    <div className={`mt-0.5 shrink-0 ${isDone ? "text-green-600" : "text-muted-foreground"}`}>
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </div>
                    <span className={isDone ? "line-through opacity-70" : ""}>{c}</span>
                  </li>
                )
              })}
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
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => deleteTask(selectedTask.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setSelectedTask(null)}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
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
                    {selectedTask.acceptanceCriteria.map((ac, idx) => {
                      const isDone = selectedTask.completedAcIndices?.includes(idx)
                      return (
                        <li 
                          key={idx} 
                          className="flex items-start gap-3 text-sm text-muted-foreground cursor-pointer hover:bg-slate-50 p-2 rounded-md transition-colors"
                          onClick={() => toggleAc(selectedTask.id, idx)}
                        >
                          <div className={`mt-0.5 shrink-0 ${isDone ? "text-green-600" : "text-muted-foreground"}`}>
                            {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          </div>
                          <span className={isDone ? "line-through opacity-70" : ""}>{ac}</span>
                        </li>
                      )
                    })}
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

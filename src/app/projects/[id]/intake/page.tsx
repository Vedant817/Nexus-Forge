"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { fetchApiJson } from "@/lib/client/api-response"

interface Source {
  id: string
  type: string
  title: string
  rawContent: string
  createdAt: string
}

export default function IntakePage() {
  const params = useParams()
  const router = useRouter()
  const [sources, setSources] = useState<Source[]>([])
  const [type, setType] = useState("blog")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [repoUrl, setRepoUrl] = useState("")
  const [prUrl, setPrUrl] = useState("")
  const [editRevision, setEditRevision] = useState(0)
  const [excludedPaths, setExcludedPaths] = useState("")
  const [runAcknowledged, setRunAcknowledged] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const estimatedSourceChars = sources.reduce((sum, source) => sum + (source.rawContent?.length ?? 0), 0)

  useEffect(() => {
    const id = params.id
    fetchApiJson<Source[]>(`/api/projects/${id}/sources`, undefined, "Unable to load sources.")
      .then(setSources)
      .catch((cause: Error) => setError(cause.message))
    fetchApiJson<{ repoUrl?: string; prUrl?: string; editRevision?: number; excludedPaths?: string[] }>(`/api/projects/${id}`, undefined, "Unable to load project URLs.")
      .then(data => {
        setRepoUrl(data.repoUrl || "")
        setPrUrl(data.prUrl || "")
        setExcludedPaths((data.excludedPaths ?? []).join('\n'))
        if (!Number.isSafeInteger(data.editRevision)) throw new Error("Project response did not include a valid edit revision.")
        setEditRevision(data.editRevision!)
      })
      .catch((cause: Error) => setError(cause.message))
  }, [params.id])

  async function saveExclusions() {
    setError("")
    try {
      const paths = excludedPaths.split('\n').map((line) => line.trim()).filter(Boolean)
      const updated = await fetchApiJson<{ editRevision?: number }>(`/api/projects/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedPaths: paths, expectedRevision: editRevision }),
      }, "Unable to save path exclusions.")
      if (!Number.isSafeInteger(updated.editRevision)) throw new Error("Project update returned an invalid revision.")
      setEditRevision(updated.editRevision!)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save path exclusions.")
    }
  }

  async function refreshSources() {
    setSources(await fetchApiJson<Source[]>(`/api/projects/${params.id}/sources`, undefined, "Unable to refresh sources."))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, rawContent: content }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to add source")
        return
      }
      setContent("")
      setTitle("")
      await refreshSources()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to add source")
    } finally {
      setSubmitting(false)
    }
  }

  async function updateUrls() {
    setError("")
    try {
      const updated = await fetchApiJson<{ editRevision?: number }>(`/api/projects/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, prUrl, expectedRevision: editRevision }),
      }, "Unable to update GitHub URLs.")
      if (!Number.isSafeInteger(updated.editRevision)) throw new Error("Project update returned an invalid revision.")
      setEditRevision(updated.editRevision!)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update GitHub URLs.")
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'txt' && ext !== 'md') {
      setError('Only .txt and .md files are supported')
      return
    }
    if (file.size > 100000) {
      setError('File too large (max 100KB)')
      return
    }
    setUploading(true)
    setError("")
    try {
      const text = await file.text()
      const res = await fetch(`/api/projects/${params.id}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: 'file', title: file.name, rawContent: text }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to upload file")
        return
      }
      await refreshSources()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to read file")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Project Intake</h1>
        <p className="text-muted-foreground mt-1">Add learning sources, repo URLs, and AI agent logs.</p>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>GitHub URLs</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Repo URL</Label>
            <Input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" onBlur={updateUrls} />
          </div>
          <div className="space-y-2">
            <Label>PR URL</Label>
            <Input value={prUrl} onChange={e => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/1" onBlur={updateUrls} />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Upload .txt / .md File</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              onChange={handleFileUpload}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            {uploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Paste Source Content</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="blog">Blog / Substack</option>
                <option value="transcript">YouTube Transcript</option>
                <option value="agent_log">AI Agent Chat Log</option>
                <option value="notes">Manual Notes</option>
                <option value="docs">Technical Docs</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Source title (optional)" />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Paste transcript, blog text, agent chat log, or other content here..."
                rows={10}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Source"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {sources.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Sources ({sources.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sources.map(s => (
                <div key={s.id} className="p-3 rounded-md border flex items-start justify-between">
                  <div>
                    <Badge variant="secondary" className="mb-1">{s.type}</Badge>
                    <p className="text-sm font-medium">{s.title || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.rawContent.slice(0, 200)}...</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      setError("")
                      try {
                        await fetchApiJson(`/api/projects/${params.id}/sources/${s.id}`, { method: "DELETE" }, "Unable to remove source.")
                        await refreshSources()
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : "Unable to remove source.")
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Path exclusions and transfer estimate</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label>Excluded repository paths (one relative path per line)</Label>
          <Textarea value={excludedPaths} onChange={e => setExcludedPaths(e.target.value)} rows={4} placeholder={"docs/drafts\nsecrets/"} onBlur={() => void saveExclusions()} />
          <p className="text-xs text-muted-foreground">Estimate: {sources.length} source(s), ~{estimatedSourceChars.toLocaleString()} source characters. Excluded paths are skipped before collection.</p>
        </CardContent>
      </Card>

      {sources.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Before you run</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Deterministic-only runs contact no model provider. If external inference is enabled, redacted excerpts go to Groq solely to generate explanations and drafts. Secret scanning cannot guarantee complete removal. The run manifest records provider and privacy decisions.</p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={runAcknowledged} onChange={e => setRunAcknowledged(e.target.checked)} />
              I understand what data leaves the workspace and why.
            </label>
            <div className="flex justify-center">
              <Button disabled={isAnalyzing || !runAcknowledged} onClick={async () => {
                setIsAnalyzing(true)
                setError("")
                try {
                  const run = await fetchApiJson<{ runId?: string; status?: string }>(`/api/projects/${params.id}/run-analysis`, { method: "POST" }, "Unable to start analysis.")
                  if (!run.runId || typeof run.status !== "string") throw new Error("Analysis start returned an invalid response.")
                  router.push(`/projects/${params.id}`)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Unable to start analysis.")
                  setIsAnalyzing(false)
                }
              }}>
                {isAnalyzing ? "Starting Analysis..." : "Run Analysis"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = params.id
    fetch(`/api/projects/${id}/sources`)
      .then(res => { if (res.ok) return res.json() })
      .then(data => { if (data) setSources(data) })
      .catch(() => {})
    fetch(`/api/projects/${id}`)
      .then(res => { if (res.ok) return res.json() })
      .then(data => {
        if (data) {
          setRepoUrl(data.repoUrl || "")
          setPrUrl(data.prUrl || "")
        }
      })
      .catch(() => {})
  }, [params.id])

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
      const id = params.id
      fetch(`/api/projects/${id}/sources`)
        .then(r => { if (r.ok) return r.json() })
        .then(d => { if (d) setSources(d) })
    } catch {
      setError("Failed to add source")
    } finally {
      setSubmitting(false)
    }
  }

  async function updateUrls() {
    try {
      await fetch(`/api/projects/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, prUrl }),
      })
    } catch {}
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
      const id = params.id
      fetch(`/api/projects/${id}/sources`)
        .then(r => { if (r.ok) return r.json() })
        .then(d => { if (d) setSources(d) })
    } catch {
      setError("Failed to read file")
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
                      await fetch(`/api/projects/${params.id}/sources/${s.id}`, { method: "DELETE" })
                      const id = params.id
                      fetch(`/api/projects/${id}/sources`)
                        .then(r => { if (r.ok) return r.json() })
                        .then(d => { if (d) setSources(d) })
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

      {sources.length > 0 && (
        <div className="flex justify-center mt-6">
          <Button disabled={isAnalyzing} onClick={async () => {
            setIsAnalyzing(true)
            await fetch(`/api/projects/${params.id}/run-analysis`, { method: "POST" })
            router.push(`/projects/${params.id}`)
          }}>
            {isAnalyzing ? "Starting Analysis..." : "Run Analysis"}
          </Button>
        </div>
      )}
    </div>
  )
}

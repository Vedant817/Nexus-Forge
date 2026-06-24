"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [prUrl, setPrUrl] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal, repoUrl, prUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.details?.fieldErrors ? Object.values(data.details.fieldErrors).flat().join(", ") : "Failed to create project")
        return
      }
      router.push(`/projects/${data.id}`)
    } catch {
      setError("Failed to create project")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Create Project</h1>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>Define your project and optionally link a GitHub repository.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="My AI Project" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal">Project Goal</Label>
              <Textarea id="goal" value={goal} onChange={e => setGoal(e.target.value)} placeholder="What do you want to build?" rows={3} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="repoUrl">GitHub Repo URL</Label>
              <Input id="repoUrl" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prUrl">GitHub PR URL</Label>
              <Input id="prUrl" value={prUrl} onChange={e => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/1" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating..." : "Create Project"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

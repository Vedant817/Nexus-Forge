"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface ProofPageData {
  portfolioSummary: string
  resumeBullet: string
  demoVideoScript: string
  interviewExplanation: string
  linkedinPost: string
  proofScore: number
  missingProofItems: string
}

export default function ProofPage() {
  const params = useParams()
  const [data, setData] = useState<ProofPageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/proof-pack`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">Loading...</div></div>
  if (!data) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-muted-foreground">No proof pack yet. Run analysis first.</div></div>

  const missing = safeParse(data.missingProofItems) as string[]
  const scoreColor = data.proofScore >= 70 ? "text-green-600" : data.proofScore >= 40 ? "text-yellow-600" : "text-red-600"

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Proof of Work Pack</h1>
          <p className="text-muted-foreground mt-1">Portfolio-ready documentation of your work</p>
        </div>
        <Button
          onClick={() => window.open(`/api/projects/${params.id}/export/proof-pack.md`, "_blank")}
        >
          Export Markdown
        </Button>
      </div>

      <Card className="mb-6 border-indigo-100 bg-indigo-50/30">
        <CardHeader>
          <CardTitle className="text-indigo-800 text-lg">Auto-Marketing: GitHub Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-indigo-700 mb-4">
            Want automatic updates to your LinkedIn Post and Resume Bullet every time you merge code? 
            Add this Webhook URL to your GitHub repository (Settings {">"} Webhooks {">"} Add Webhook). 
            Select <strong>Content type: application/json</strong> and send only <strong>Pull Request</strong> events.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-white p-2 rounded border flex-1 overflow-x-auto text-indigo-900 font-mono">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/github?projectId={params.id}
            </code>
            <Button 
              variant="outline" 
              className="shrink-0 bg-white"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/github?projectId=${params.id}`)
                alert("Webhook URL copied to clipboard!")
              }}
            >
              Copy URL
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Proof Score</CardTitle></CardHeader>
        <CardContent>
          <p className={`text-4xl font-bold ${scoreColor}`}>{data.proofScore}/100</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Portfolio Summary</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{data.portfolioSummary}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Resume Bullet</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{data.resumeBullet}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Demo Video Script</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm whitespace-pre-wrap leading-relaxed font-mono bg-muted p-4 rounded-md">
            {data.demoVideoScript}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Interview Explanation</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{data.interviewExplanation}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>LinkedIn Post</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm whitespace-pre-wrap leading-relaxed bg-muted p-4 rounded-md">
            {data.linkedinPost}
          </div>
        </CardContent>
      </Card>

      {missing.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Missing Proof Items</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 space-y-1">
              {missing.map((m: string, i: number) => <li key={i} className="text-sm">{m}</li>)}
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

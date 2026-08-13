"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ReactFlow, Controls, Background, MiniMap, Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function ArchitecturePage() {
  const params = useParams()
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{ commitSha: string; extractorVersion: string; complete: boolean; coverage: Record<string, number>; diagnostics: Array<{ code: string; detail: string }> } | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${params.id}/architecture`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Unable to load dependency map')
        return data
      })
      .then(data => {
        setNodes((data.nodes || []).map((node: { id: string; kind: string; label: string; position: { x: number; y: number } }) => ({ ...node, data: { label: node.label, kind: node.kind } })))
        setEdges(data.edges || [])
        setMetadata({ commitSha: data.snapshot.commitSha, extractorVersion: data.extractorVersion, complete: data.complete, coverage: data.coverage, diagnostics: data.diagnostics })
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <div className="text-muted-foreground font-medium">Loading dependency map…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-destructive font-medium">Failed to load architecture</div>
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-muted-foreground">No architecture data available yet. Please run the analysis first.</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 h-[calc(100vh-80px)] max-h-[1200px]">
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Repository Dependency Map</h1>
          <p className="text-muted-foreground mt-1">Deterministic syntax-level imports pinned to commit <code>{metadata?.commitSha.slice(0, 12)}</code>.</p>
          {metadata && <p className="text-xs text-muted-foreground mt-1">Extractor {metadata.extractorVersion}; parsed {metadata.coverage.parsed ?? 0}/{metadata.coverage.discovered ?? 0} files.</p>}
          {metadata && !metadata.complete && <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Incomplete map: {metadata.diagnostics.map((diagnostic) => diagnostic.detail).join(' ')}</div>}
        </div>

        <Card className="flex-1 overflow-hidden shadow-lg border-primary/20">
          <CardContent className="p-0 h-full w-full relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              attributionPosition="bottom-right"
              className="bg-slate-50"
            >
              <Background color="#ccc" gap={16} />
              <Controls />
              <MiniMap zoomable pannable nodeClassName="bg-primary/20 rounded-sm" />
            </ReactFlow>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

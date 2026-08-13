'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ScorecardResponse = {
  scorecards: Array<{
    id: string
    version: string
    score: number | null
    completenessRatio: number
    criterionResults: Array<{
      id: string
      criterionId: string
      status: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE'
      reason: string
      reasonCode: string
      evidenceLinks: Array<{
        evidenceRecord: {
          stableEvidenceId: string
          source: string
          provenance: string
          confidence: string
          commitSha?: string | null
          path?: string | null
        }
      }>
    }>
  }>
}

const labels = { PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', NOT_APPLICABLE: 'N/A' } as const

export function ScorecardDetails({ projectId, kind }: { projectId: string; kind: 'REPOSITORY_MATURITY' | 'RELEASE_READINESS' | 'PROOF_COMPLETENESS' }) {
  const [data, setData] = useState<ScorecardResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/scorecards?kind=${kind}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load scorecard')))
      .then((value: ScorecardResponse) => { if (!cancelled) setData(value) })
      .catch(() => { if (!cancelled) setData({ scorecards: [] }) })
    return () => { cancelled = true }
  }, [kind, projectId])

  const scorecard = data?.scorecards[0]
  if (!data) return <p className="text-sm text-muted-foreground">Loading criterion evidence…</p>
  if (!scorecard) return <p className="text-sm text-muted-foreground">No active-run scorecard is available.</p>

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Criterion evidence</CardTitle>
        <p className="text-xs text-muted-foreground">Methodology {scorecard.version} · {Math.round(scorecard.completenessRatio * 100)}% complete · unknown signals are not failures</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {scorecard.criterionResults.map((criterion) => (
          <div key={criterion.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={criterion.status === 'PASS' ? 'default' : criterion.status === 'FAIL' ? 'destructive' : 'outline'}>{labels[criterion.status]}</Badge>
              <span className="font-mono text-xs">{criterion.criterionId}</span>
            </div>
            <p className="mt-2 text-sm">{criterion.reason}</p>
            <p className="text-xs text-muted-foreground">Reason code: {criterion.reasonCode}</p>
            {criterion.evidenceLinks.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {criterion.evidenceLinks.map(({ evidenceRecord }) => (
                  <li key={evidenceRecord.stableEvidenceId}>
                    <code>{evidenceRecord.stableEvidenceId}</code> · {evidenceRecord.source} · {evidenceRecord.provenance} · {evidenceRecord.confidence}
                    {evidenceRecord.commitSha ? ` · commit ${evidenceRecord.commitSha}` : ' · commit unknown'}
                    {evidenceRecord.path ? ` · ${evidenceRecord.path}` : ''}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">No evidence record linked; this limitation is explicit.</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

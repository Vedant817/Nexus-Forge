'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SetupChecklist(props: {
  projectId: string
  hasSources: boolean
  repoUrl: string
  bindingStatus: string
  exclusionsSet: boolean
  inferenceDecided: boolean
  baselineReady: boolean
}) {
  const steps = [
    { label: 'Connect a supported repository via the GitHub App', done: props.bindingStatus === 'active', href: `/projects/${props.projectId}#github`, hint: 'Admin approval may be required by your GitHub organization.' },
    { label: 'Add at least one learning source', done: props.hasSources, href: `/projects/${props.projectId}/intake`, hint: 'Paste content or upload .txt/.md; URL content must be pasted.' },
    { label: 'Set path exclusions', done: props.exclusionsSet, href: `/projects/${props.projectId}/intake`, hint: 'Excluded paths are skipped before collection.' },
    { label: 'Choose deterministic-only or authorize inference', done: props.inferenceDecided, href: `/projects/${props.projectId}#privacy`, hint: 'Private repos stay deterministic until explicitly authorized.' },
    { label: 'Run your first baseline (about 2–5 minutes)', done: props.baselineReady, href: `/projects/${props.projectId}/intake`, hint: 'Deterministic evidence seals before any optional generation.' },
  ]
  return (
    <Card className="mb-8">
      <CardHeader><CardTitle>Setup checklist</CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-2">
              <Badge variant={step.done ? 'default' : 'outline'} aria-label={step.done ? 'done' : 'todo'}>{step.done ? 'Done' : 'To do'}</Badge>
              <div>
                <Link className="underline" href={step.href}>{step.label}</Link>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TrustCenterPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Trust center</h1>
      <p className="text-muted-foreground mb-6">Understand and control external data transfer before the first transfer.</p>
      <Card className="mb-4">
        <CardHeader><CardTitle>Just-in-time disclosure</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Deterministic-only runs contact no model provider. They produce sealed evidence, scorecards, and dependency maps.</p>
          <p>When external inference is enabled, redacted source excerpts, repository inventory, and PR context go to Groq (model per run manifest) solely to generate explanations, workflows, and drafts. Secret scanning reduces risk but cannot guarantee complete removal.</p>
          <p>Every run records provider and model identity plus the privacy decision in its admission manifest.</p>
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader><CardTitle>Deletion stages</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="font-medium">Immediate revocation:</span> access removed and new processing stopped at request time.</p>
          <p><span className="font-medium">Active-system deletion:</span> primary and derived stores purged promptly with a completion record.</p>
          <p><span className="font-medium">Backup expiry:</span> backups age out on the hosting schedule and are never restored for deleted tenants.</p>
          <p><span className="font-medium">Legal records:</span> only minimal non-content billing metadata, if required.</p>
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>Privacy, terms, DPA, subprocessors, retention, security overview, and disclosure contact ship in <code>docs/legal</code>.</p>
          <p>Manage repository connections, sessions, and recent security activity from Settings.</p>
          <div className="flex gap-4 pt-2">
            <Link className="underline" href="/settings/connections">Repository connections</Link>
            <Link className="underline" href="/settings/sessions">Sessions and activity</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

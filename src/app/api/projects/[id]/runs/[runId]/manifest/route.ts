import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const run = await prisma.analysisRun.findFirst({
    where: { id: runId, projectId: id, ownerId: access.value.user.id },
    select: { id: true, admissionManifest: true, admissionDigest: true, processingMode: true, pipelineVersion: true, modelConfig: true },
  })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  return NextResponse.json(run, {
    headers: { 'Content-Disposition': `attachment; filename="manifest-${runId}.json"` },
  })
}

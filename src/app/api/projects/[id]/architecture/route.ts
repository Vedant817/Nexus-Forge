import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { dependencyMapSchema } from '@/lib/repository/dependency-map'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const project = await prisma.project.findUnique({
    where: { id, ownerId: access.value.user.id }, select: { activeAnalysisRunId: true },
  })
  if (!project?.activeAnalysisRunId) return NextResponse.json({ error: 'No active successful analysis run' }, { status: 404 })
  const artifact = await prisma.artifactVersion.findUnique({
    where: { analysisRunId_kind_schemaVersion: { analysisRunId: project.activeAnalysisRunId, kind: 'DEPENDENCY_MAP', schemaVersion: 1 } },
    select: { content: true, contentHash: true, createdAt: true },
  })
  if (!artifact) return NextResponse.json({ error: 'No dependency map available for the active run' }, { status: 404 })
  const parsed = dependencyMapSchema.safeParse(artifact.content)
  if (!parsed.success) return NextResponse.json({ error: 'Stored dependency map is invalid' }, { status: 500 })
  return NextResponse.json({ ...parsed.data, contentHash: artifact.contentHash, createdAt: artifact.createdAt })
}

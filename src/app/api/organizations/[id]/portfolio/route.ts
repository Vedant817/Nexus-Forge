import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  const membership = await prisma.membership.findFirst({ where: { organizationId: id, userId: session.value.id } })
  const org = await prisma.organization.findUnique({ where: { id }, select: { ownerId: true } })
  if (!org || (org.ownerId !== session.value.id && !membership)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const projects = await prisma.project.findMany({ where: { organizationId: id }, select: { id: true, name: true, status: true } })
  const projectIds = projects.map((project) => project.id)
  const [openFindings, waivers, baselines, digests] = await Promise.all([
    prisma.finding.count({ where: { projectId: { in: projectIds }, status: { in: ['OPEN', 'REGRESSED'] } } }),
    prisma.findingWaiver.count({ where: { finding: { projectId: { in: projectIds } } } }),
    prisma.acceptedBaseline.count({ where: { projectId: { in: projectIds } } }),
    prisma.baselineDigest.count({ where: { projectId: { in: projectIds } } }),
  ])
  return NextResponse.json({
    projects: projects.length, openFindings, waivers, baselines, digests,
    projectsList: projects,
    note: 'Custom policy output is labeled separately and never rewrites canonical history.',
  })
}

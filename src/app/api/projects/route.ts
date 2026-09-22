import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { createProjectSchema } from '@/lib/security/validation'
import { readBoundedJson } from '@/lib/security/body-limit'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logAudit } from '@/lib/security/audit-log'
import { requireSession } from '@/lib/auth/authorization'
import { resolveRepositoryIdentity } from '@/lib/github/repository-identity'

const MAX_PROJECTS_PER_USER = 50

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: session.value.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { sources: true } },
        repoAnalysis: { select: { maturityScore: true, scoreStatus: true, scoreCompleteness: true } },
        proofPack: { select: { proofScore: true, scoreStatus: true, scoreCompleteness: true } },
        releaseReport: { select: { releaseScore: true, scoreStatus: true, scoreCompleteness: true } },
      },
    })
    return NextResponse.json(projects)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response

  const rateCheck = await checkRateLimit(`projects:user:${session.value.id}`, { windowMs: 60_000, maxRequests: 10 })
  if (!rateCheck.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })

  try {
    const bounded = await readBoundedJson(request, 64 * 1024)
    if (!bounded.ok) return bounded.response
    const parsed = createProjectSchema.safeParse(bounded.value)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { name, goal, repoUrl, prUrl } = parsed.data

    const identity = resolveRepositoryIdentity(repoUrl, prUrl)
    if (!identity.ok) {
      return NextResponse.json({ error: identity.error }, { status: 400 })
    }

    const existingCount = await prisma.project.count({ where: { ownerId: session.value.id } })
    if (existingCount >= MAX_PROJECTS_PER_USER) {
      return NextResponse.json({ error: 'Project limit reached for this workspace.' }, { status: 409 })
    }

    const project = await prisma.project.create({
      data: {
        ownerId: session.value.id,
        name,
        goal,
        repoUrl,
        prUrl,
        githubRepositoryFullName: identity.fullName,
      },
    })

    await logAudit('project_created', `Project "${redactSecrets(name).slice(0, 200)}" created`, project.id)

    return NextResponse.json(project, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

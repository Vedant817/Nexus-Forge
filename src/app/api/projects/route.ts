import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { createProjectSchema } from '@/lib/security/validation'
import { logAudit } from '@/lib/security/audit-log'
import { parseGitHubRepoUrl, parseGitHubPrUrl } from '@/lib/security/url-safety'

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { sources: true } },
        repoAnalysis: { select: { maturityScore: true } },
        proofPack: { select: { proofScore: true } },
        releaseReport: { select: { releaseScore: true } },
      },
    })
    return NextResponse.json(projects)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = createProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { name, goal, repoUrl, prUrl } = parsed.data

    if (repoUrl) {
      const result = parseGitHubRepoUrl(repoUrl)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
    }
    if (prUrl) {
      const result = parseGitHubPrUrl(prUrl)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
    }

    const project = await prisma.project.create({
      data: { name, goal, repoUrl, prUrl },
    })

    await logAudit('project_created', `Project "${name}" created`, project.id)

    return NextResponse.json(project, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

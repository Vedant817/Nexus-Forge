import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logAudit } from '@/lib/security/audit-log'
import { runPraxisForgePipeline } from '@/lib/workflows/praxis-forge-pipeline'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const rateCheck = checkRateLimit(`analysis:${id}`, { windowMs: 60000, maxRequests: 3 })
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before running analysis again.' }, {
      status: 429,
      headers: { 'X-RateLimit-Reset': String(rateCheck.resetAt) },
    })
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { sources: { select: { id: true } } },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.status === 'analyzing') {
      return NextResponse.json({ error: 'Analysis is already running for this project' }, { status: 409 })
    }

    if (project.sources.length === 0 && !project.repoUrl) {
      return NextResponse.json({ error: 'Add at least one source or repo URL before running analysis' }, { status: 400 })
    }

    await logAudit('analysis_started', 'API: Analysis requested', id)

    const result = await runPraxisForgePipeline(id)

    return NextResponse.json({ success: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    await logAudit('analysis_failed', message, id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse, after } from 'next/server'
import prisma from '@/lib/db/prisma'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logAudit } from '@/lib/security/audit-log'
import { runNexusForgePipeline } from '@/lib/workflows/nexus-forge-pipeline'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const rateCheck = await checkRateLimit(`analysis:${id}`, { windowMs: 60000, maxRequests: 3 })
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

    const TIMEOUT_MS = 5 * 60 * 1000
    
    after(async () => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timed out after 5 minutes')), TIMEOUT_MS)
      )
      
      try {
        await Promise.race([runNexusForgePipeline(id), timeoutPromise])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed'
        await logAudit('analysis_failed', message, id)
        try {
          await prisma.project.update({
            where: { id },
            data: { status: 'error' }
          })
        } catch (e) {}
      }
    })

    return NextResponse.json({ success: true, message: 'Analysis started in the background' }, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    await logAudit('analysis_failed', message, id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

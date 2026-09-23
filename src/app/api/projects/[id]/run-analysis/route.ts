import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logStructured } from '@/lib/observability/logger'
import { ActiveAnalysisRunError, enqueueAnalysis } from '@/lib/execution/enqueue-analysis'

const runOverrideSchema = z.object({
  provider: z.enum(['groq', 'openai', 'anthropic', 'google', 'moonshot', 'deepseek']).optional(),
  model: z.string().min(1).max(200).optional(),
}).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'create_run')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })

  const rateCheck = await checkRateLimit(`analysis:user:${access.value.user.id}:project:${id}`, {
    windowMs: 60_000,
    maxRequests: 3,
  })
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before running analysis again.' },
      { status: 429, headers: { 'X-RateLimit-Reset': String(rateCheck.resetAt) } },
    )
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.slice(0, 100)
  if (idempotencyKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key_userId_projectId: { key: idempotencyKey, userId: access.value.user.id, projectId: id } },
      select: { runId: true },
    })
    if (existing) {
      return NextResponse.json({ runId: existing.runId, status: 'QUEUED', deduplicated: true }, {
        status: 202,
        headers: { Location: `/api/projects/${id}/runs/${existing.runId}` },
      })
    }
  }

  // An empty POST body means "no override" (existing callers send none).
  let override: { provider: 'groq' | 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek'; model: string } | undefined
  const rawBody = await request.text().catch(() => '')
  if (rawBody.trim()) {
    if (Buffer.byteLength(rawBody, 'utf8') > 4 * 1024) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 })
    }
    let value: unknown
    try {
      value = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Request must be valid JSON.' }, { status: 400 })
    }
    const parsed = runOverrideSchema.safeParse(value)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid model override. Provide provider and model together.' }, { status: 400 })
    if ((parsed.data.provider && !parsed.data.model) || (!parsed.data.provider && parsed.data.model)) {
      return NextResponse.json({ error: 'Provider and model must be provided together.' }, { status: 400 })
    }
    if (parsed.data.provider && parsed.data.model) override = { provider: parsed.data.provider, model: parsed.data.model }
  }

  try {
    const result = await enqueueAnalysis(id, access.value.user.id, override)
    if (idempotencyKey) {
      try {
        await prisma.idempotencyKey.create({ data: { key: idempotencyKey, userId: access.value.user.id, projectId: id, runId: result.runId } })
      } catch {
        const existing = await prisma.idempotencyKey.findUnique({
          where: { key_userId_projectId: { key: idempotencyKey, userId: access.value.user.id, projectId: id } },
          select: { runId: true },
        })
        if (existing) {
          return NextResponse.json({ runId: existing.runId, status: 'QUEUED', deduplicated: true }, {
            status: 202,
            headers: { Location: `/api/projects/${id}/runs/${existing.runId}` },
          })
        }
      }
    }
    return NextResponse.json(result, {
      status: 202,
      headers: { Location: `/api/projects/${id}/runs/${result.runId}` },
    })
  } catch (error) {
    if (error instanceof ActiveAnalysisRunError) {
      return NextResponse.json(
        { error: error.message, runId: error.runId, status: 'ACTIVE' },
        { status: 409 },
      )
    }
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Add at least')) return NextResponse.json({ error: message }, { status: 400 })
    if (message === 'Project not found') return NextResponse.json({ error: message }, { status: 404 })
    logStructured('error', 'analysis enqueue failed', { projectId: id })
    return NextResponse.json({ error: 'Unable to enqueue analysis safely' }, { status: 500 })
  }
}

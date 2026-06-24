import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { createSourceSchema } from '@/lib/security/validation'
import { checkPromptInjection } from '@/lib/security/prompt-injection-guard'
import { logAudit } from '@/lib/security/audit-log'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const sources = await prisma.source.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(sources)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = createSourceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { type, title, rawContent } = parsed.data

    const injectionCheck = checkPromptInjection(rawContent)
    const hasSuspiciousContent = injectionCheck.suspicious

    const source = await prisma.source.create({
      data: {
        projectId: id,
        type,
        title,
        rawContent,
        documentId: `doc_${Date.now()}`,
      },
    })

    await prisma.project.update({
      where: { id },
      data: { status: 'has_sources' },
    })

    await logAudit('source_added', `Source added: ${type}${hasSuspiciousContent ? ' (suspicious content flagged)' : ''}`, id)

    return NextResponse.json({ ...source, flagged: hasSuspiciousContent ? injectionCheck : undefined }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to add source' }, { status: 500 })
  }
}

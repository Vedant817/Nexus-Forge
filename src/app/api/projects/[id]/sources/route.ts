import { NextResponse } from 'next/server'
import config from '@/lib/config/env'
import prisma from '@/lib/db/prisma'
import { createSourceSchema } from '@/lib/security/validation'
import { checkPromptInjection } from '@/lib/security/prompt-injection-guard'
import { hasBlockingFinding, scanSecretContent, SECRET_SCANNER_VERSION } from '@/lib/security/secret-scanner'
import { assertIngestionEnabled } from '@/lib/ai/data-policy'
import { redactSecrets } from '@/lib/security/secret-redaction'
import { logAudit } from '@/lib/security/audit-log'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

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
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const project = await prisma.project.findUnique({ 
      where: { id },
      include: { _count: { select: { sources: true } } }
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project._count.sources >= config.MAX_SOURCES_PER_PROJECT) {
      return NextResponse.json({ error: `Maximum of ${config.MAX_SOURCES_PER_PROJECT} sources per project reached.` }, { status: 400 })
    }

    const bounded = await (await import('@/lib/security/body-limit')).readBoundedJson(request, 256 * 1024)
    if (!bounded.ok) return bounded.response
    const parsed = createSourceSchema.safeParse(bounded.value)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    try {
      assertIngestionEnabled()
    } catch {
      return NextResponse.json({ error: 'Ingestion is temporarily disabled.' }, { status: 503 })
    }
    if (project.ingestionSuspendedAt) return NextResponse.json({ error: 'Ingestion is suspended for this project.' }, { status: 403 })
    const { type, title, rawContent } = parsed.data

    const injectionCheck = checkPromptInjection(rawContent)
    const hasSuspiciousContent = injectionCheck.suspicious
    const findings = scanSecretContent(rawContent, title || type)
    const quarantined = hasBlockingFinding(findings)

    const source = await prisma.source.create({
      data: {
        projectId: id,
        type,
        title,
        rawContent,
        documentId: `doc_${Date.now()}`,
        quarantineStatus: quarantined ? 'QUARANTINED' : 'CLEAR',
        quarantineReason: quarantined ? [...new Set(findings.map((finding) => finding.kind))].join(',').slice(0, 500) : null,
        scannerVersion: SECRET_SCANNER_VERSION,
      },
    })

    await prisma.project.update({
      where: { id },
      data: { status: 'has_sources' },
    })

    await logAudit('source_added', `Source added: ${redactSecrets(type)}${hasSuspiciousContent ? ' (suspicious content flagged)' : ''}${quarantined ? ' (quarantined by secret scanner)' : ''}`, id)

    if (quarantined) {
      return NextResponse.json({ ...source, quarantined: true, findingKinds: [...new Set(findings.map((finding) => finding.kind))], flagged: hasSuspiciousContent ? injectionCheck : undefined }, { status: 201 })
    }
    return NextResponse.json({ ...source, flagged: hasSuspiciousContent ? injectionCheck : undefined }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to add source' }, { status: 500 })
  }
}

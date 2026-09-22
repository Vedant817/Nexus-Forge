import { NextResponse } from 'next/server'
import config from '@/lib/config/env'
import prisma from '@/lib/db/prisma'
import { containsUnsafeContentChars, createSourceSchema, isAllowedUploadFilename } from '@/lib/security/validation'
import { assessUntrustedContent, SECRET_SCANNER_VERSION } from '@/lib/security/secret-scanner'
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
    // Defense in depth: quarantined content is masked on read unless an active
    // audited override exists. The run pipeline additionally refuses quarantined rows.
    const masked = await Promise.all(sources.map(async (source) => {
      if (source.quarantineStatus !== 'QUARANTINED') return source
      const { contentHash } = await import('@/lib/execution/hash')
      const override = await prisma.secretOverride.findUnique({
        where: { projectId_contentHash: { projectId: id, contentHash: contentHash(source.rawContent) } },
      })
      if (override && (!override.expiresAt || override.expiresAt.getTime() > Date.now())) return source
      return { ...source, rawContent: '[QUARANTINED: resolve or add an audited override to view]' }
    }))
    return NextResponse.json(masked)
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

    // Server-side upload validation: the browser check is not a security boundary.
    if (type === 'file') {
      if (!isAllowedUploadFilename(title)) {
        return NextResponse.json({ error: 'File names must be 1-100 characters of letters, digits, dot, underscore, or hyphen ending in .txt or .md.' }, { status: 400 })
      }
      if (containsUnsafeContentChars(rawContent)) {
        return NextResponse.json({ error: 'Content contains disallowed control characters.' }, { status: 400 })
      }
      if (rawContent.split('\n').length > 20_000) {
        return NextResponse.json({ error: 'File exceeds the 20,000-line limit.' }, { status: 400 })
      }
    }

    const assessment = assessUntrustedContent(rawContent, title || type)
    const hasSuspiciousContent = assessment.injectionSeverity !== 'none'
    const quarantined = assessment.quarantined
    const quarantineKinds = assessment.reasons

    const source = await prisma.source.create({
      data: {
        projectId: id,
        type,
        title,
        rawContent,
        documentId: `doc_${Date.now()}`,
        quarantineStatus: quarantined ? 'QUARANTINED' : 'CLEAR',
        quarantineReason: quarantined ? quarantineKinds.join(',').slice(0, 500) : null,
        scannerVersion: SECRET_SCANNER_VERSION,
      },
    })

    await prisma.project.update({
      where: { id },
      data: { status: 'has_sources' },
    })

    await logAudit('source_added', `Source added: ${redactSecrets(type)}${hasSuspiciousContent ? ' (suspicious content flagged)' : ''}${quarantined ? ' (quarantined by secret scanner)' : ''}`, id)

    if (quarantined) {
      return NextResponse.json({ ...source, quarantined: true, findingKinds: quarantineKinds, flagged: hasSuspiciousContent ? { suspicious: true, severity: assessment.injectionSeverity, matchedPatterns: assessment.injectionPatterns } : undefined }, { status: 201 })
    }
    return NextResponse.json({ ...source, flagged: hasSuspiciousContent ? { suspicious: true, severity: assessment.injectionSeverity, matchedPatterns: assessment.injectionPatterns } : undefined }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to add source' }, { status: 500 })
  }
}

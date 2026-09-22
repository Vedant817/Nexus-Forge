import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { FIXED_CHECK_PROFILES } from '@/lib/verification/envelopes'
import { logAudit } from '@/lib/security/audit-log'

const proposeSchema = z.object({
  runId: z.string().min(1).max(100),
  files: z.array(z.string().min(1).max(500)).min(1).max(25),
  checkProfile: z.enum(FIXED_CHECK_PROFILES).default('default'),
  patch: z.string().min(1).max(100_000),
}).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const requests = await prisma.verificationRequest.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 25 })
  return NextResponse.json({ requests })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'approve_sandbox')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = proposeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Select 1-25 files and a fixed check profile with a bounded patch.' }, { status: 400 })
  const run = await prisma.analysisRun.findFirst({ where: { id: parsed.data.runId, projectId: id, status: 'SUCCEEDED' } })
  if (!run?.admissionDigest) return NextResponse.json({ error: 'A sealed run with an admission manifest is required.' }, { status: 400 })
  const patchHash = createHash('sha256').update(parsed.data.patch, 'utf8').digest('hex')
  await prisma.artifactVersion.create({
    data: {
      projectId: id, analysisRunId: run.id, kind: 'PATCH_PROPOSAL', schemaVersion: 1,
      content: { files: parsed.data.files, checkProfile: parsed.data.checkProfile, patch: parsed.data.patch.slice(0, 100_000) } as never,
      contentHash: patchHash,
    },
  }).catch(() => {})
  const verification = await prisma.verificationRequest.create({
    data: {
      projectId: id, runId: run.id, files: parsed.data.files as never, checkProfile: parsed.data.checkProfile,
      patchHash, manifestHash: run.admissionDigest, status: 'PROPOSED', createdBy: access.value.user.id,
    },
  })
  await logAudit('approval_decision', 'Verification patch proposed', id, { actorId: access.value.user.id, targetId: verification.id })
  return NextResponse.json(verification, { status: 201 })
}

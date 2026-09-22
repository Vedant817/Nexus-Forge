import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { PRIVACY_ACK_VERSION } from '@/lib/ai/data-policy'
import { logAudit } from '@/lib/security/audit-log'

const privacySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  externalInferenceEnabled: z.boolean().optional(),
  acknowledgement: z.boolean().optional(),
  ingestionSuspended: z.boolean().optional(),
  ingestionReason: z.string().max(500).optional(),
  inferenceSuspended: z.boolean().optional(),
  inferenceReason: z.string().max(500).optional(),
}).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'approve_inference')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const parsed = privacySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid privacy update.' }, { status: 400 })
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (parsed.data.expectedRevision !== project.editRevision) {
    return NextResponse.json({ error: 'Project changed in another session. Reload before saving.', currentRevision: project.editRevision }, { status: 409 })
  }
  if (parsed.data.externalInferenceEnabled === true && parsed.data.acknowledgement !== true) {
    return NextResponse.json({ error: 'Enabling external inference requires explicit residual-risk acknowledgement.' }, { status: 400 })
  }
  const updated = await prisma.project.updateMany({
    where: { id, ownerId: access.value.user.id, editRevision: project.editRevision },
    data: {
      externalInferenceEnabled: parsed.data.externalInferenceEnabled ?? project.externalInferenceEnabled,
      externalInferenceAuthorizedBy: parsed.data.externalInferenceEnabled === true ? access.value.user.id : parsed.data.externalInferenceEnabled === false ? null : project.externalInferenceAuthorizedBy,
      externalInferenceAuthorizedAt: parsed.data.externalInferenceEnabled === true ? new Date() : parsed.data.externalInferenceEnabled === false ? null : project.externalInferenceAuthorizedAt,
      externalInferenceAckVersion: parsed.data.externalInferenceEnabled === true ? PRIVACY_ACK_VERSION : parsed.data.externalInferenceEnabled === false ? null : project.externalInferenceAckVersion,
      ingestionSuspendedAt: parsed.data.ingestionSuspended === true ? new Date() : parsed.data.ingestionSuspended === false ? null : project.ingestionSuspendedAt,
      ingestionSuspendReason: parsed.data.ingestionSuspended === true ? (parsed.data.ingestionReason ?? 'Suspended by owner.') : parsed.data.ingestionSuspended === false ? null : project.ingestionSuspendReason,
      inferenceSuspendedAt: parsed.data.inferenceSuspended === true ? new Date() : parsed.data.inferenceSuspended === false ? null : project.inferenceSuspendedAt,
      inferenceSuspendReason: parsed.data.inferenceSuspended === true ? (parsed.data.inferenceReason ?? 'Suspended by owner.') : parsed.data.inferenceSuspended === false ? null : project.inferenceSuspendReason,
      editRevision: { increment: 1 },
    },
  })
  if (updated.count !== 1) return NextResponse.json({ error: 'Project changed in another session. Reload before saving.' }, { status: 409 })
  await logAudit('privacy_updated', 'Project data-transfer policy updated', id)
  return NextResponse.json({ revision: project.editRevision + 1 })
}

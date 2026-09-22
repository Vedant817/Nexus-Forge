import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { requireTenantAction } from '@/lib/auth/tenancy'
import { logAudit } from '@/lib/security/audit-log'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const tenant = await requireTenantAction(id, access.value.user.id, 'approve_sandbox')
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const verification = await prisma.verificationRequest.findFirst({ where: { id: requestId, projectId: id } })
  if (!verification || !verification.patchHash || !verification.manifestHash) {
    return NextResponse.json({ error: 'Verification request is not approvable.' }, { status: 400 })
  }
  const updated = await prisma.verificationRequest.updateMany({
    where: { id: requestId, projectId: id, status: 'PROPOSED' },
    data: { status: 'APPROVED' },
  })
  if (updated.count !== 1) return NextResponse.json({ error: 'Verification was already decided.' }, { status: 409 })
  await logAudit('approval_decision', 'Verification patch approved for sandbox checks', id, { actorId: access.value.user.id, targetId: requestId })
  return NextResponse.json({ approved: true, patchHash: verification.patchHash, manifestHash: verification.manifestHash })
}

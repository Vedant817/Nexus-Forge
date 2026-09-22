import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { verifyEnvelope, type SandboxEnvelope } from '@/lib/verification/envelopes'
import { logAudit } from '@/lib/security/audit-log'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  const envelope = await request.json().catch(() => null) as SandboxEnvelope | null
  if (!envelope?.envelopeId || !envelope.signature) return NextResponse.json({ error: 'Result envelope is required.' }, { status: 400 })
  const verification = await prisma.verificationRequest.findFirst({ where: { id: requestId, projectId: id } })
  if (!verification || verification.status !== 'APPROVED' || !verification.patchHash || !verification.manifestHash) {
    return NextResponse.json({ error: 'Verification is not approved for sandbox execution.' }, { status: 400 })
  }
  const checked = await verifyEnvelope(envelope, { requestId, runId: verification.runId, patchHash: verification.patchHash, manifestHash: verification.manifestHash })
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  try {
    await prisma.verificationResult.create({
      data: {
        requestId, envelopeId: envelope.envelopeId, checkId: envelope.checkId.slice(0, 200),
        status: envelope.status.slice(0, 50), exitCode: envelope.exitCode,
        outputDigest: envelope.outputDigest, keyId: envelope.keyId,
      },
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Replayed envelope.' }, { status: 409 })
    }
    throw error
  }
  await prisma.verificationRequest.update({ where: { id: requestId }, data: { status: 'VERIFIED' } })
  await logAudit('agent_completed', `Sandbox checks ${envelope.status}`, id, { actorId: access.value.user.id, targetId: requestId })
  return NextResponse.json({ verified: true, status: envelope.status })
}

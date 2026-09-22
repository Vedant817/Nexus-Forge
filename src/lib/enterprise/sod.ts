import prisma from '@/lib/db/prisma'

export async function checkSeparationOfDuty(input: { organizationId?: string | null; actionA: string; actionB: string; actorA?: string | null; actorB: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.organizationId) return { ok: true }
  if (!input.actorA || input.actorA === input.actorB) {
    const policy = await prisma.separationOfDuty.findUnique({
      where: { organizationId_actionA_actionB: { organizationId: input.organizationId, actionA: input.actionA, actionB: input.actionB } },
    })
    if (policy && input.actorA === input.actorB) {
      return { ok: false, error: 'Separation of duties requires a different approver.' }
    }
  }
  return { ok: true }
}

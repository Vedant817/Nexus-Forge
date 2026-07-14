import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { exportProofPackMarkdown } from '@/lib/export/markdown'
import { logAudit } from '@/lib/security/audit-log'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const proof = await prisma.proofPack.findUnique({ where: { projectId: id } })
    if (!proof) return NextResponse.json({ error: 'No proof pack found' }, { status: 404 })

    const output = exportProofPackMarkdown({
      portfolioSummary: proof.portfolioSummary,
      resumeBullet: proof.resumeBullet,
      demoVideoScript: proof.demoVideoScript,
      interviewExplanation: proof.interviewExplanation,
      linkedinPost: proof.linkedinPost,
      proofScore: proof.proofScore,
      missingProofItems: Array.isArray(proof.missingProofItems) ? proof.missingProofItems : JSON.parse(String(proof.missingProofItems)),
    })

    await logAudit('export_generated', 'Proof pack markdown exported', id)

    return new NextResponse(output, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="proof-pack.md"',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to export proof pack' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { updateProjectSchema } from '@/lib/security/validation'
import { logAudit } from '@/lib/security/audit-log'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        sources: true,
        knowledge: true,
        repoAnalysis: true,
        workflow: true,
        releaseReport: true,
        proofPack: true,
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = updateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const project = await prisma.project.update({
      where: { id },
      data: parsed.data,
    })
    await logAudit('project_updated', `Project updated`, id)
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.project.delete({ where: { id } })
    await logAudit('project_deleted', `Project deleted`, id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}

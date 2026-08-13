import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const workflow = await prisma.workflow.findUnique({ where: { projectId: id } })
    if (!workflow) return NextResponse.json({ error: 'No workflow found' }, { status: 404 })
    return NextResponse.json(workflow)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const body = await request.json()
    const { tasksJson, completedAcceptanceCriteria } = body
    
    const dataToUpdate: { tasksJson?: string; completedAcceptanceCriteria?: string } = {}
    if (tasksJson !== undefined) dataToUpdate.tasksJson = tasksJson
    if (completedAcceptanceCriteria !== undefined) dataToUpdate.completedAcceptanceCriteria = completedAcceptanceCriteria

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }

    const updated = await prisma.workflow.update({
      where: { projectId: id },
      data: dataToUpdate
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}

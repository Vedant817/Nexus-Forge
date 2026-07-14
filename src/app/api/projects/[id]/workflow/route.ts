import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  try {
    const body = await request.json()
    const { tasksJson, completedAcceptanceCriteria } = body
    
    const dataToUpdate: Prisma.WorkflowUpdateInput = {}
    if (tasksJson !== undefined) dataToUpdate.tasksJson = parseJsonField(tasksJson) as Prisma.InputJsonValue
    if (completedAcceptanceCriteria !== undefined) dataToUpdate.completedAcceptanceCriteria = parseJsonField(completedAcceptanceCriteria) as Prisma.InputJsonValue

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

function parseJsonField(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

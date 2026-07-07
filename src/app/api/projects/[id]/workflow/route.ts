import { NextResponse } from 'next/server'
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
    const { tasksJson } = body
    if (!tasksJson) return NextResponse.json({ error: 'Missing tasksJson' }, { status: 400 })

    const updated = await prisma.workflow.update({
      where: { projectId: id },
      data: { tasksJson }
    })
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 })
  }
}

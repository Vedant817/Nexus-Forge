import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import type { WorkflowTask } from '@/types'
import { requireProjectAccess } from '@/lib/auth/authorization'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { workflow: true, repoAnalysis: true }
    })

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const workflow = project.workflow
    const repoAnalysis = project.repoAnalysis

    let cursorrulesContent = `# Nexus Forge IDE Context\n\n`
    cursorrulesContent += `## Project Objective\n`
    cursorrulesContent += `${workflow?.objective || project.goal || 'No objective set.'}\n\n`

    if (repoAnalysis?.architectureSummary) {
      cursorrulesContent += `## Architecture Constraints\n`
      cursorrulesContent += `${repoAnalysis.architectureSummary}\n\n`
    }

    if (workflow?.tasksJson) {
      const tasks = JSON.parse(workflow.tasksJson) as WorkflowTask[]
      const inProgressTasks = tasks.filter((task) => task.status === 'in_progress')
      
      cursorrulesContent += `## Current Active Tasks\n`
      if (inProgressTasks.length > 0) {
        inProgressTasks.forEach((task) => {
          cursorrulesContent += `### [IN PROGRESS] ${task.title}\n`
          cursorrulesContent += `**Description**: ${task.description}\n`
          if (task.suggestedAgentPrompt) {
            cursorrulesContent += `**Agent Prompt**: ${task.suggestedAgentPrompt}\n`
          }
          if (task.acceptanceCriteria.length > 0) {
            cursorrulesContent += `**Acceptance Criteria**:\n`
            task.acceptanceCriteria.forEach((ac) => {
              cursorrulesContent += `- ${ac}\n`
            })
          }
          cursorrulesContent += `\n`
        })
      } else {
        cursorrulesContent += `No tasks are currently marked as "In Progress" in the Kanban board.\n\n`
      }
    }

    return new NextResponse(cursorrulesContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename=".cursorrules"',
      },
    })
  } catch (error) {
    console.error('Failed to export cursorrules:', error)
    return NextResponse.json({ error: 'Failed to export cursorrules' }, { status: 500 })
  }
}

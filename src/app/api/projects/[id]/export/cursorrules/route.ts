import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import type { WorkflowTask } from '@/types'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
      const tasks = parseTasks(workflow.tasksJson)
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
      
      cursorrulesContent += `## Current Active Tasks\n`
      if (inProgressTasks.length > 0) {
        inProgressTasks.forEach(t => {
          cursorrulesContent += `### [IN PROGRESS] ${t.title}\n`
          cursorrulesContent += `**Description**: ${t.description}\n`
          if (t.suggestedAgentPrompt) {
            cursorrulesContent += `**Agent Prompt**: ${t.suggestedAgentPrompt}\n`
          }
          if (t.acceptanceCriteria && t.acceptanceCriteria.length > 0) {
            cursorrulesContent += `**Acceptance Criteria**:\n`
            t.acceptanceCriteria.forEach((ac: string) => {
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

function parseTasks(value: unknown): WorkflowTask[] {
  if (Array.isArray(value)) return value as WorkflowTask[]
  if (typeof value !== 'string') return []
  try { return JSON.parse(value) as WorkflowTask[] } catch { return [] }
}

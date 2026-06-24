import prisma from '@/lib/db/prisma'

export type AuditAction =
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'source_added'
  | 'source_deleted'
  | 'analysis_started'
  | 'analysis_completed'
  | 'analysis_failed'
  | 'github_fetched'
  | 'agent_completed'
  | 'export_generated'
  | 'error'

export async function logAudit(action: AuditAction, details: string = '', projectId: string = ''): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { action, details, projectId },
    })
  } catch {
    console.error(`Failed to log audit: ${action}`)
  }
}

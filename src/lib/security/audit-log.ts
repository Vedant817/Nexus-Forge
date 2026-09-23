import { randomUUID } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { redactSecrets } from '@/lib/security/secret-redaction'

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
  | 'privacy_updated'
  | 'auth_session'
  | 'membership_changed'
  | 'approval_decision'
  | 'billing_transition'
  | 'support_access'
  | 'byok_key_saved'
  | 'byok_key_validated'
  | 'byok_key_deleted'
  | 'error'

export type AuditContext = {
  actorId?: string
  organizationId?: string
  targetId?: string
  requestId?: string
  iface?: string
  outcome?: string
}

export async function logAudit(action: AuditAction, details: string = '', projectId: string = '', context: AuditContext = {}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        details: redactSecrets(details).slice(0, 2000),
        projectId,
        userId: context.actorId,
        organizationId: context.organizationId,
        targetId: context.targetId,
        requestId: context.requestId ?? randomUUID(),
        interface: (context.iface ?? 'api').slice(0, 50),
        outcome: (context.outcome ?? 'success').slice(0, 50),
      },
    })
  } catch {
    console.error(`Failed to log audit: ${action}`)
  }
}

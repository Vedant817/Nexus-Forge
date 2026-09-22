import prisma from '@/lib/db/prisma'

export const TENANT_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'REVIEWER', 'VIEWER'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

export type TenantAction =
  | 'view'
  | 'connect_repository'
  | 'create_run'
  | 'publish_template'
  | 'accept_baseline'
  | 'approve_inference'
  | 'approve_sandbox'
  | 'policy_exception'
  | 'export_sensitive'
  | 'manage_members'

const ROLE_RANK: Record<TenantRole, number> = { OWNER: 5, ADMIN: 4, OPERATOR: 3, REVIEWER: 2, VIEWER: 1 }

const ACTION_MINIMUM: Record<TenantAction, TenantRole> = {
  view: 'VIEWER',
  connect_repository: 'ADMIN',
  create_run: 'OPERATOR',
  publish_template: 'ADMIN',
  accept_baseline: 'REVIEWER',
  approve_inference: 'ADMIN',
  approve_sandbox: 'ADMIN',
  policy_exception: 'ADMIN',
  export_sensitive: 'ADMIN',
  manage_members: 'ADMIN',
}

export function canPerform(action: TenantAction, role: TenantRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[ACTION_MINIMUM[action]]
}

export async function getProjectRole(projectId: string, userId: string): Promise<TenantRole | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, organizationId: true } })
  if (!project) return null
  if (project.ownerId === userId) return 'OWNER'
  if (!project.organizationId) return null
  const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: project.organizationId, userId } }, select: { role: true } })
  if (!membership) return null
  return TENANT_ROLES.includes(membership.role as TenantRole) ? (membership.role as TenantRole) : null
}

export async function requireTenantAction(projectId: string, userId: string, action: TenantAction): Promise<{ ok: true; role: TenantRole } | { ok: false; status: number; error: string }> {
  const role = await getProjectRole(projectId, userId)
  if (!role) return { ok: false, status: 404, error: 'Project not found' }
  if (!canPerform(action, role)) return { ok: false, status: 403, error: 'Insufficient workspace permission for this action.' }
  return { ok: true, role }
}

import 'server-only'

import { auth } from '@/lib/auth'
import prisma from '@/lib/db/prisma'

export type AuthenticatedUser = {
  id: string
  name: string
  email: string
}

type Authorized<T> = { ok: true; value: T }
type Denied = { ok: false; response: Response }
export type AuthorizationResult<T> = Authorized<T> | Denied

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

export async function requireSession(headers: Headers): Promise<AuthorizationResult<AuthenticatedUser>> {
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    return { ok: false, response: jsonError('Authentication required', 401) }
  }

  return {
    ok: true,
    value: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
  }
}

export async function requireProjectAccess(
  headers: Headers,
  projectId: string,
): Promise<AuthorizationResult<{ user: AuthenticatedUser; projectId: string }>> {
  const session = await requireSession(headers)
  if (!session.ok) return session

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: session.value.id },
    select: { id: true },
  })

  if (!project) {
    // Do not reveal whether another tenant owns this identifier.
    return { ok: false, response: jsonError('Project not found', 404) }
  }

  return {
    ok: true,
    value: { user: session.value, projectId: project.id },
  }
}

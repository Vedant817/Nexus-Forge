import { z } from 'zod'
import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireProjectAccess } from '@/lib/auth/authorization'
import { createInstallationToken, invalidateInstallationTokens } from '@/lib/github/app-auth'
import { githubJson } from '@/lib/github/http'

const bindingSchema = z.object({
  installationId: z.string().regex(/^\d+$/),
  repositoryId: z.string().regex(/^\d+$/),
  repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).max(300),
}).strict()

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  const configured = process.env.BETTER_AUTH_URL
  return Boolean(configured && new URL(configured).origin === origin)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const parsed = bindingSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid GitHub binding request' }, { status: 400 })

  try {
    const installation = await createInstallationToken(parsed.data)
    const repository = await githubJson<{ id: number; full_name: string }>(`/repositories/${parsed.data.repositoryId}`, {
      token: installation.token,
    })
    if (String(repository.id) !== parsed.data.repositoryId || repository.full_name.toLowerCase() !== parsed.data.repositoryFullName.toLowerCase()) {
      return NextResponse.json({ error: 'GitHub repository identity mismatch' }, { status: 400 })
    }
    await prisma.project.update({
      where: { id, ownerId: access.value.user.id },
      data: {
        githubInstallationId: parsed.data.installationId,
        githubRepositoryId: parsed.data.repositoryId,
        githubRepositoryFullName: repository.full_name.toLowerCase(),
        githubBindingStatus: 'active', githubBindingDisabledAt: null,
        repoUrl: `https://github.com/${repository.full_name}`,
      },
    })
    return NextResponse.json({ connected: true, repositoryFullName: repository.full_name.toLowerCase() })
  } catch {
    return NextResponse.json({ error: 'Unable to validate GitHub App installation access' }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireProjectAccess(request.headers, id)
  if (!access.ok) return access.response
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const project = await prisma.project.findUnique({ where: { id, ownerId: access.value.user.id }, select: { githubInstallationId: true } })
  if (project?.githubInstallationId) invalidateInstallationTokens(project.githubInstallationId)
  await prisma.project.update({
    where: { id, ownerId: access.value.user.id },
    data: { githubBindingStatus: 'disconnected', githubBindingDisabledAt: new Date(), githubInstallationId: null, githubRepositoryId: null },
  })
  return NextResponse.json({ connected: false })
}

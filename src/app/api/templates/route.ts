import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  // Read-only: curated templates are seeded by migration
  // 20260923200000_seed_run_templates. Template versions move through migrations.
  const templates = await prisma.runTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({ templates })
}

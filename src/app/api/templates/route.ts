import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { requireSession } from '@/lib/auth/authorization'
import { CURATED_TEMPLATES } from '@/lib/pilot/profiles'

export async function GET(request: Request) {
  const session = await requireSession(request.headers)
  if (!session.ok) return session.response
  let templates = await prisma.runTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  if (!templates.length) {
    for (const template of CURATED_TEMPLATES) {
      await prisma.runTemplate.upsert({
        where: { name: template.name },
        create: { name: template.name, description: template.description, controls: template.controls as never },
        update: {},
      })
    }
    templates = await prisma.runTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  }
  return NextResponse.json({ templates })
}

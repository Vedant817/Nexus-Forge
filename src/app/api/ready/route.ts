import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ready: true, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ ready: false }, { status: 503 })
  }
}

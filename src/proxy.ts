import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export function proxy(request: NextRequest) {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin')
    if (origin) {
      const configured = process.env.BETTER_AUTH_URL
      try {
        if (!configured || new URL(configured).origin !== origin) {
          return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
      }
    }
  }
  if (request.nextUrl.pathname.startsWith('/api/admin/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    if (!isIpAllowed(ip)) return NextResponse.json({ error: 'IP not allowlisted' }, { status: 403 })
  }
  const path = request.nextUrl.pathname
  const isProtectedPage = path === '/projects' || path.startsWith('/projects/')
  const hasSessionCookie = Boolean(getSessionCookie(request))

  // This is only an optimistic UX redirect. Every API and DAL operation performs
  // database-backed authentication and authorization.
  if (isProtectedPage && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackURL', `${path}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

function isIpAllowed(ip: string | null): boolean {
  const allowlist = (process.env.IP_ALLOWLIST ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
  if (!allowlist.length) return true
  if (!ip) return false
  return allowlist.some((entry) => ip === entry || ip.startsWith(entry.replace(/:\d+$/, '')))
}

export function isAdminIpAllowed(ip: string | null): boolean {
  return isIpAllowed(ip)
}

export const config = {
  matcher: ['/projects/:path*', '/api/:path*'],
}

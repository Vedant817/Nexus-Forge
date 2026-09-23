import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { buildContentSecurityPolicy } from '@/lib/security/headers'

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce))
  return response
}

export function proxy(request: NextRequest) {
  // Per-request CSP nonce. Next.js injects the nonce (read from the request's
  // Content-Security-Policy header) into its inline bootstrap scripts during
  // server rendering; without it, script-src 'self' blocks hydration and every
  // client component renders as dead HTML. All pages render dynamically (root
  // layout) because prerendered HTML has no request nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin')
    if (origin) {
      const configured = process.env.BETTER_AUTH_URL
      try {
        if (!configured || new URL(configured).origin !== origin) {
          return withSecurityHeaders(NextResponse.json({ error: 'Invalid request origin' }, { status: 403 }), nonce)
        }
      } catch {
        return withSecurityHeaders(NextResponse.json({ error: 'Invalid request origin' }, { status: 403 }), nonce)
      }
    }
  }
  if (request.nextUrl.pathname.startsWith('/api/admin/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    if (!isIpAllowed(ip)) return withSecurityHeaders(NextResponse.json({ error: 'IP not allowlisted' }, { status: 403 }), nonce)
  }
  const path = request.nextUrl.pathname
  const isProtectedPage = path === '/projects' || path.startsWith('/projects/')
  const hasSessionCookie = Boolean(getSessionCookie(request))

  // This is only an optimistic UX redirect. Every API and DAL operation performs
  // database-backed authentication and authorization.
  if (isProtectedPage && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackURL', `${path}${request.nextUrl.search}`)
    return withSecurityHeaders(NextResponse.redirect(loginUrl), nonce)
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce)
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
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}

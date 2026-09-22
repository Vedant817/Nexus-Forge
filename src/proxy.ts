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

export const config = {
  matcher: ['/projects/:path*', '/api/:path*'],
}

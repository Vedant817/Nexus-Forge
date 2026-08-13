import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export function proxy(request: NextRequest) {
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
  matcher: ['/projects/:path*'],
}

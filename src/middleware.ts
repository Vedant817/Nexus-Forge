import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : undefined

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (isApiRoute && origin) {
    if (ALLOWED_ORIGINS && !ALLOWED_ORIGINS.includes(origin)) {
      return new NextResponse(null, { status: 403 })
    }

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
  }

  const response = NextResponse.next()

  if (isApiRoute && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}

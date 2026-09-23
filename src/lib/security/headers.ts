// Shared security-header definitions. The Content-Security-Policy carries a
// per-request nonce (see src/middleware.ts): Next.js App Router cannot hydrate
// without its inline bootstrap scripts, so a static script-src without a nonce
// silently disables every client component. Static headers stay here so tests
// and next.config.ts share one definition.

export const STATIC_SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
] as const

export function buildContentSecurityPolicy(nonce: string): string {
  if (!nonce || nonce.length > 200) throw new Error('A per-request CSP nonce is required.')
  // React development builds require eval for component-stack reconstruction;
  // production never uses eval.
  const devEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${devEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function buildSecurityHeaders(nonce: string): Array<{ key: string; value: string }> {
  return [...STATIC_SECURITY_HEADERS.map((header) => ({ ...header })), { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(nonce) }]
}

export function hasValidRequestOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  const configured = process.env.BETTER_AUTH_URL
  if (!configured) return false
  try {
    return new URL(configured).origin === origin
  } catch {
    return false
  }
}

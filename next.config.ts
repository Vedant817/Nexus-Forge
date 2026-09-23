import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security/headers";

// NOTE: Content-Security-Policy is intentionally NOT set here. It is emitted
// per request by src/middleware.ts with a fresh nonce; a second static CSP
// header would also be enforced by browsers and re-block hydration.
const securityHeaders: Array<{ key: string; value: string }> = STATIC_SECURITY_HEADERS.map((header) => ({ ...header }))

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
};

export function getSecurityHeaders(): Array<{ key: string; value: string }> {
  return securityHeaders.map((header) => ({ ...header }))
}

export default nextConfig;

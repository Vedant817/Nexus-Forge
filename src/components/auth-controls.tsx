'use client'

import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export function AuthControls() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <span className="text-xs text-muted-foreground">Checking session…</span>
  if (!session?.user) {
    return <Link href="/login" className="hover:text-primary/80 transition-colors">Sign in</Link>
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut()
        window.location.assign('/login')
      }}
      className="hover:text-primary/80 transition-colors"
    >
      Sign out
    </button>
  )
}

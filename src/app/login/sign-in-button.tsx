'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export function SignInButton({ callbackURL }: { callbackURL: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setPending(true)
    setError(null)
    // Route OAuth failures back here so the login page can explain them;
    // otherwise better-auth drops users on a bare error URL with no retry.
    const result = await authClient.signIn.social({ provider: 'github', callbackURL, errorCallbackURL: '/login' })
    if (result.error) {
      setError(result.error.message ?? 'Unable to start GitHub sign-in.')
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? 'Redirecting…' : 'Continue with GitHub'}
      </button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

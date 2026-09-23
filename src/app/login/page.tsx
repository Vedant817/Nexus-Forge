import { describeOAuthError } from '@/lib/auth/oauth-errors'
import { SignInButton } from './sign-in-button'

type LoginPageProps = {
  searchParams: Promise<{ callbackURL?: string; error?: string; error_description?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const requestedCallback = params.callbackURL
  const callbackURL = requestedCallback?.startsWith('/projects') ? requestedCallback : '/projects'
  const failure = describeOAuthError(params.error, params.error_description)

  return (
    <div className="container mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <section className="w-full rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Sign in to Nexus Forge</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          GitHub sign-in protects repository evidence and analysis results by project owner.
        </p>
        {failure ? <p role="alert" className="mb-4 text-sm text-destructive">{failure}</p> : null}
        <SignInButton callbackURL={callbackURL} />
      </section>
    </div>
  )
}

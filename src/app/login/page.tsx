import { SignInButton } from './sign-in-button'

type LoginPageProps = {
  searchParams: Promise<{ callbackURL?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const requestedCallback = (await searchParams).callbackURL
  const callbackURL = requestedCallback?.startsWith('/projects') ? requestedCallback : '/projects'

  return (
    <div className="container mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <section className="w-full rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Sign in to Nexus Forge</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          GitHub sign-in protects repository evidence and analysis results by project owner.
        </p>
        <SignInButton callbackURL={callbackURL} />
      </section>
    </div>
  )
}

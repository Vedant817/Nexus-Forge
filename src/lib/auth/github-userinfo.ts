// GitHub profile -> app identity resolution. Mirrors better-auth's default
// GitHub mapping, with privacy-safe diagnostics for the no-email case.

export type GitHubProfile = {
  id: number
  login?: string
  name?: string | null
  email?: string | null
  avatar_url?: string
}

export type GitHubEmailEntry = {
  email?: string
  primary?: boolean
  verified?: boolean
}

export function resolveGitHubEmail(
  profile: Pick<GitHubProfile, 'email'>,
  emails: GitHubEmailEntry[] | null,
): { email: string | null; emailVerified: boolean } {
  const email = profile.email ?? (Array.isArray(emails) ? ((emails.find((entry) => entry.primary) ?? emails[0])?.email ?? null) : null)
  const emailVerified = Array.isArray(emails) ? (emails.find((entry) => entry.email === email)?.verified ?? false) : false
  return { email, emailVerified }
}

/** Privacy-safe outcome code for logs: counts and statuses only, never addresses. */
export function diagnoseGitHubEmail(emailsStatus: number, emails: GitHubEmailEntry[] | null): string {
  if (!Array.isArray(emails)) return 'emails-unavailable'
  return `emails-empty-${emails.length}`
}

export function toGitHubUser(profile: GitHubProfile, email: string | null, emailVerified: boolean): {
  user: { id: string; name: string; email: string | null; image: string | undefined; emailVerified: boolean }
  data: GitHubProfile
} {
  return {
    user: {
      id: String(profile.id),
      name: profile.name || profile.login || '',
      email,
      image: profile.avatar_url,
      emailVerified,
    },
    data: profile,
  }
}

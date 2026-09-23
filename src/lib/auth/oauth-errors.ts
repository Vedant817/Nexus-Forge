// Human-readable copy for OAuth failure codes surfaced as ?error= on the
// login page. Codes come from better-auth's OAuth callback handler.

const OAUTH_ERROR_COPY: Record<string, string> = {
  email_not_found: 'GitHub did not share an email address for this account. Add and verify an email under GitHub Settings → Emails, then try again.',
  access_denied: 'GitHub authorization was cancelled. Try again and approve the request to continue.',
  account_already_linked_to_different_user: 'This GitHub account is already linked to a different Nexus Forge user. Sign in with the matching account.',
  unable_to_get_user_info: 'GitHub did not return profile information. Please try again.',
}

export function describeOAuthError(code: string | undefined, description: string | undefined): string | null {
  if (!code) return null
  return OAUTH_ERROR_COPY[code] ?? description ?? 'GitHub sign-in failed. Please try again.'
}

// src/sharedBudgets/friendlyError.ts
// Supabase surfaces Postgres exceptions and transport failures verbatim, which
// gives the user strings like 'invalid_code' or 'Failed to fetch'. Every shared
// budget error passes through here so the UI says what happened and what to do
// about it. Anything unrecognised falls through unchanged rather than being
// flattened into a generic apology, so real faults stay diagnosable.

interface Rule {
  match: RegExp
  message: string
}

const RULES: Rule[] = [
  {
    match: /invalid_code/i,
    message: 'No budget uses that code. Check it with whoever sent it.',
  },
  {
    match: /not_owner/i,
    message: 'Only the person who created this budget can change it.',
  },
  {
    match: /not signed in|jwt|refresh token/i,
    message: 'Your session expired. Sign in again to continue.',
  },
  {
    match: /failed to fetch|network|load failed/i,
    message: 'Cannot reach the server. Check your connection and try again.',
  },
  {
    match: /duplicate key|unique constraint/i,
    message: 'That already exists. Try a different name.',
  },
  {
    match: /row-level security|permission denied|violates row-level/i,
    message: 'You do not have permission to do that in this budget.',
  },
]

export function friendlyError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const rule = RULES.find(r => r.match.test(raw))
  if (rule) return rule.message
  return raw.trim() === '' ? 'Something went wrong. Try again.' : raw
}

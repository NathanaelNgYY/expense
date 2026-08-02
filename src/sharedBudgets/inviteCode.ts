// src/sharedBudgets/inviteCode.ts
// Pure invite-code logic, kept out of the components so both the join field and
// the invite screen share one definition of what a code is and how an invite
// reads. generate_invite_code() in 001_shared_budgets.sql draws six characters
// from ABCDEFGHJKMNPQRSTUVWXYZ23456789; the ambiguous glyphs (I, L, O, 0, 1) are
// excluded there so a code read off a screen cannot be mistyped into a different
// valid code.

import type { SharedBudget } from './types'

export const CODE_LENGTH = 6

/** Codes arrive pasted out of a chat message, so they come wrapped in spaces,
 *  dashes, and whatever case the sender's keyboard produced. Recover the code
 *  rather than bouncing the user off a server error. */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH)
}

/** One wording for the invite, shared by the post-create invite screen and the
 *  owner's Share button, so the two can never drift. */
export function inviteMessage(budget: SharedBudget, origin: string): string {
  return `Join my "${budget.name}" budget on ${origin} with code ${budget.inviteCode}`
}

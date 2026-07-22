# S1 — Ingest-token rotation + last-used

**Date:** 2026-07-22
**Status:** Approved (design)
**Audit item:** S1 in `docs/PRODUCT_AUDIT_2026-07-19.md` (§5 Security, v1.1 "The number never lies")

## Product diagnosis

### Who this is for

The owner and the two shared users, each of whom has a single long-lived iOS-Shortcut bearer
token minted once, by hand, server-side. The token is what lets a phone tap POST a transaction to
the `ingest` Edge Function. There is no way, from inside the app, to replace that token.

### Pain

The ingest token is a long-lived shared secret with **no rotation path**. If it leaks (screenshot
of the Shortcut, a shared device, a synced clipboard, a repo mishap), the only remedy today is a
manual SQL/console operation the user can't perform. A financial-capture credential that can only be
rotated by an engineer is exactly the credential you most want the owner to be able to rotate
themselves. The audit also asks for a visible **last-used** signal so a user can confirm the token
is live before trusting the number.

### Why now

S1 is a v1.1 security item. The plumbing already exists: `ingest_tokens` maps `sha256(token) →
user_id`, the `ingest` function looks tokens up by hash, and `ingest_status` already exposes a
client-readable **last-captured** timestamp (the last-used half of S1 is effectively already
shipped — see Scope). What's missing is a self-service, authenticated **rotate** action and an
expiry column so the old token can be retired safely.

### Ten-star version

The app detects a likely-compromised or stale token and proactively prompts rotation; rotation is a
one-tap flow that also rewrites the iOS Shortcut for you via a deep link. Auto-rewriting the
Shortcut needs an iOS-side integration out of scope here; this MVP makes rotation a safe, visible,
self-service action and tells the user exactly what to paste.

### MVP decision

Add an **authenticated** "Rotate ingest token" action in Settings → Automatic Capture that:
mints a new token, shows it **once**, and expires the previous token after a **grace window** so
in-flight captures don't drop while the user updates their Shortcut. Rotation — not silent
replacement — so the user consciously re-arms capture and can copy the new secret before the old
one dies. The same action **mints the first token** when none exists (self-service onboarding for
the two users who currently need a manual mint).

## Scope

**In scope**

- A new authenticated Supabase Edge Function `rotate-ingest-token` (JWT-verified; **not** the
  bearer-token scheme the `ingest` function uses) that, for the signed-in user:
  1. generates a cryptographically-random opaque token,
  2. inserts its `sha256` hash into `ingest_tokens` (raw token never stored),
  3. sets `expires_at = now() + GRACE` on that user's currently-active token(s),
  4. returns the raw token **once** in the response body.
- A migration adding `expires_at timestamptz` (nullable; `null` = active) to `ingest_tokens`.
- The `ingest` function rejects a token whose `expires_at` is in the past (expired tokens
  authenticate as `401`, same as unknown tokens).
- Settings UI: a **Rotate token** button (label **Generate token** when the user has none), a
  confirm step, and a **show-once** panel with a copy control, the grace-window warning, and the
  "update your Shortcut's `Authorization: Bearer …` header" reminder.
- **Last-used** display: reuse the existing `ingest_status.last_captured_at` already rendered as
  "Last captured" in `IngestStatusCard`; relabel/adjacent-place it so it reads as the token's
  last-used signal.

**Out of scope (deferred)**

- Rewriting the iOS Shortcut automatically.
- Per-token last-used tracking (the global last-captured timestamp is sufficient for S1).
- Multiple named/simultaneous tokens per user as a feature (rotation transiently has two valid
  tokens by design, but the UI presents a single active token).
- Email/push notification on rotation (belongs with F3).
- Revoke-without-replace (rotation always mints a replacement; a true "kill switch" is a later item).

## Architecture

Follow the existing `ingest` function's split: **pure logic in a `handler.ts`, transport/storage in
`index.ts`**, so the rotation rules are unit-testable without Deno/Supabase. All new domain-ish
helpers (token generation, grace math) stay small and colocated.

### Migration — `ingest_tokens.expires_at`

```sql
alter table public.ingest_tokens add column expires_at timestamptz;
-- null = active/never-expires (all existing tokens stay active). No backfill.
```

`ingest_tokens` stays **service-role only** (RLS enabled, no client policies, no grants) — unchanged.

### New Edge Function — `supabase/functions/rotate-ingest-token/`

- `index.ts` (transport): `verify_jwt = true` in `config.toml`. Resolve the caller via the verified
  JWT (`supabase.auth.getUser(jwt)`); reject anonymous users (`is_anonymous`) — rotation requires a
  real signed-in account, matching how ingest is tied to durable users. Rate-limit via the existing
  `_shared/rateLimit.ts` (a tight per-user/IP limit; rotation is a rare action). Uses the service
  role client but every write is scoped to the JWT's `user_id`.
- `handler.ts` (pure): given a `now`, a `userId`, a random-bytes source, and a store interface,
  returns the raw token and the DB operations to perform. Deterministic and injectable for tests.

```ts
export interface RotateStore {
  activeTokenHashes(userId: string): Promise<string[]>
  expireTokens(hashes: string[], expiresAt: string): Promise<void>
  insertToken(row: { tokenHash: string; userId: string; label: string }): Promise<void>
}

export interface RotateResult { token: string }

// grace-window constant lives here; default 24h (see Open decision).
export async function rotateIngestToken(
  userId: string,
  store: RotateStore,
  now: Date = new Date(),
  randomToken: () => string = generateToken,
): Promise<RotateResult>
```

Token format: 32 random bytes (`crypto.getRandomValues`) encoded base64url — opaque, copy-pasteable,
no ambiguous characters. `label` defaults to a dated string (e.g. `Rotated 2026-07-22`) so
`ingest_status.token_label` stays meaningful (the existing `sync_ingest_status_on_token` trigger
copies it across on insert).

### `ingest` function — reject expired tokens

`index.ts` token lookup additionally selects `expires_at` and rejects when it is set and in the
past:

```ts
const { data } = await client.from('ingest_tokens')
  .select('user_id,label,expires_at')
  .eq('token_hash', await sha256Hex(token))
  .maybeSingle()
const expired = data?.expires_at != null && new Date(data.expires_at) <= new Date()
userId = expired ? null : (data?.user_id ?? null)
```

An expired token falls through to the existing `401 + auth-failure rate limit` path — no new error
surface.

### Client — `src/api.ts`

```ts
export async function rotateIngestToken(): Promise<{ token: string }>
// wraps supabase.functions.invoke('rotate-ingest-token'); maps errors to ApiError
// (401/403 → auth failure; 429 → rate limited) using the existing throwFrom conventions.
```

### UI — Settings → Automatic Capture

Extend `IngestStatusCard` (or a sibling in `screens/settings/`):

- **Rotate token** button (`Generate token` when `visibility.state === 'unlinked'`).
- Tapping opens the existing **confirm dialog** (rotation is not undoable — this is the one place the
  app's undo-not-confirm rule yields to a confirm, because a mistaken rotation forces the user to
  re-key the Shortcut). Copy: *"Generate a new token? Your current token keeps working for 24 hours
  so you can update your iOS Shortcut."*
- On success, a **show-once** panel: the raw token in a read-only field, a **Copy** button, and:
  *"Paste this into your Shortcut's Authorization header as `Bearer <token>`. Your old token stops
  working in 24 hours. This token won't be shown again."* Dismissing clears it from memory.
- **Last used**: the existing "Last captured … · Apple Pay" line stays, adjacent to the token
  controls, satisfying the last-used half of S1.
- Loading/error states: button disabled + spinner during the call; a non-blocking error notice on
  failure (reuse the card's `role="status"`/`role="alert"` notice pattern).

## Validation & safety

- **Authn/authz:** rotation is JWT-verified and scoped to `auth.uid()`; a user can only rotate their
  own token. `ingest_tokens` gains no client grants — the client never reads or writes it directly;
  only the two service-role Edge Functions touch it.
- **Secret handling:** the raw token is generated with CSPRNG bytes, returned once, and **never
  stored or logged** (only its `sha256` hash persists). No token value appears in any `console.*`.
- **Grace window** prevents a capture gap: old token stays valid for `GRACE` after rotation, so a
  Shortcut updated any time in that window never drops a transaction; after it, the old secret is
  dead even though its row lingers.
- **Rate limiting:** the rotation endpoint reuses `_shared/rateLimit.ts` with a tight limit so a
  stolen JWT can't be used to churn tokens.
- **Expired-token enforcement** is checked at the ingest boundary on every request; no reliance on a
  cleanup job. (Expired rows may be pruned opportunistically on the next rotation, but correctness
  never depends on pruning.)
- **No injection surface:** token is opaque and only ever compared by hash; the UI renders it as the
  value of a read-only input (React-escaped), never as HTML.
- **Anonymous users** cannot rotate (no durable identity to own a token) — the button is hidden/
  disabled unless a real session exists, mirroring `IngestStatusCard`'s existing account gating.

## Testing (TDD)

- **Unit — `supabase/functions/rotate-ingest-token/handler.test.ts`:** `rotateIngestToken` mints a
  token via injected RNG, expires exactly the previously-active hashes with `now + GRACE`, inserts
  the new hash with the dated label, returns the raw token once; first-mint case (no active tokens)
  inserts without expiring anything.
- **Unit — token generator:** base64url shape, length, uses the injected byte source, distinct
  outputs.
- **Ingest — `supabase/functions/ingest/handler` / index behaviour:** an expired token resolves to
  `401`; an active (`expires_at` null or future) token still authenticates. (Add coverage at the
  index/token-lookup layer since expiry is a transport concern.)
- **RLS — `supabase/tests/rls/ingest.rls.test.ts` (extend):** an authenticated user still cannot
  `select`/`insert`/`update` `ingest_tokens`; a token with a past `expires_at` is rejected by ingest;
  a freshly-rotated token writes to the correct `user_id` only.
- **Client — `src/api.test.ts`:** `rotateIngestToken` invokes the function and returns `{ token }`;
  maps 401/403 → auth failure and 429 → rate-limited via `ApiError`.
- **Component — `IngestStatusCard.test.tsx`:** button shows "Generate token" when unlinked and
  "Rotate token" when linked; confirm → success renders the show-once token + copy; dismiss clears
  it; failure shows the error notice; anonymous/no-session hides the control.

## Documentation

- Update `README.md`'s Automatic Tracking / Shortcut section: how to rotate the token, that the old
  one keeps working for the grace window, and to update the Shortcut's `Bearer` header.
- Note in the migration comment that `expires_at is null` means active.

## Rollout

Single PR, feature branch (`feat/ingest-token-rotation`), TDD (RED first) per repo convention,
merged through the protected `main` `verify`/`rls`/`e2e` gate. Requires **two deploys**: the DB
migration + the new Edge Function (`npx supabase functions deploy rotate-ingest-token`) and the
updated `ingest` function, before the client change is useful. The migration is additive and
backward-compatible (existing null `expires_at` = active), so deploy order is: migration → functions
→ client.

## Resolved decisions

- **Grace window length: 24 hours** (confirmed 2026-07-22). A single named constant
  `TOKEN_GRACE_MS = 24 * 60 * 60 * 1000` in `rotate-ingest-token/handler.ts`.

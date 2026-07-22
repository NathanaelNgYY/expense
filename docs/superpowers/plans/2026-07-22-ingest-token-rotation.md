# Implementation plan — S1 ingest-token rotation + last-used

**Spec:** `docs/superpowers/specs/2026-07-22-ingest-token-rotation-design.md`
**Branch:** `feat/ingest-token-rotation`
**Approach:** TDD (RED → GREEN → refactor), subagent-driven. Grace window **24h**.

## Ground truth (verified in source)

- `ingest_tokens(token_hash pk, user_id, label, created_at)` — RLS on, **no client policies/grants**;
  only the service-role Edge Functions read it. Multiple rows per `user_id` are already allowed.
- `ingest` Edge Function (`supabase/functions/ingest/index.ts`) hashes the Bearer token (`sha256Hex`)
  and looks it up in `ingest_tokens` → `user_id`, `label`. Pure logic is split into `handler.ts`,
  which is unit-tested with **vitest** (`handler.test.ts`). `index.ts` uses `npm:`-specifiers and is
  covered by `deno check` via the `typecheck:functions` npm script.
- `ingest_status` is client-readable (RLS `select own`); a trigger `sync_ingest_status_on_token`
  copies `label` into `ingest_status.token_label` on `ingest_tokens` insert/update. `IngestStatusCard`
  already renders `last_captured_at` as "Last captured …" (the last-used half of S1).
- Client Supabase access: `getSupabase()` from `src/lib/supabaseClient.ts`; `src/api.ts` wraps calls
  and maps errors through `throwFrom`/`ApiError` (401/403 auth, 429 rate-limited).
- Rate limiting helper: `supabase/functions/_shared/rateLimit.ts` (`checkRateLimit`,
  `rateLimitedResponse`, policies).

---

## Task 1 — Expiry column + ingest rejects expired tokens

**Goal:** add `expires_at` to `ingest_tokens` and make `ingest` reject expired tokens, with the
decision extracted into a pure, vitest-tested helper.

**Files**
- NEW `supabase/migrations/20260722120000_ingest_token_expiry.sql`
- EDIT `supabase/functions/ingest/handler.ts` (add pure helper)
- EDIT `supabase/functions/ingest/handler.test.ts` (RED)
- EDIT `supabase/functions/ingest/index.ts` (select `expires_at`, use helper)
- EDIT `supabase/tests/rls/ingest.rls.test.ts` (expiry regression at the DB layer)

**Migration**
```sql
-- Nullable: existing tokens (expires_at is null) stay active forever. Rotation sets this to
-- now()+grace on the superseded token so captures don't drop mid-Shortcut-update.
alter table public.ingest_tokens add column expires_at timestamptz;
```

**Pure helper (RED first in `handler.test.ts`)**
```ts
// handler.ts
export interface IngestTokenRow { user_id: string; expires_at: string | null }

// Returns the owning user id for a token row, or null when the row is missing or expired.
export function activeTokenUserId(row: IngestTokenRow | null, now: Date = new Date()): string | null {
  if (!row) return null
  if (row.expires_at != null && new Date(row.expires_at).getTime() <= now.getTime()) return null
  return row.user_id
}
```
Tests: `null` row → null; `expires_at: null` → user_id; future `expires_at` → user_id; past
`expires_at` → null; exactly-`now` → null (boundary, treated as expired).

**Wire into `index.ts`**
```ts
const { data } = await client.from('ingest_tokens')
  .select('user_id,label,expires_at')
  .eq('token_hash', await sha256Hex(token))
  .maybeSingle()
userId = activeTokenUserId(data ?? null)
tokenLabel = data?.label ?? ''
```
(Import `activeTokenUserId` from `./handler.ts`.) Expired/unknown both fall through to the existing
`401 + AUTH_FAILURE_RATE_LIMIT` path — no new response shape.

**RLS test additions (DB-layer only — do NOT assert Edge-Function HTTP here):**
- Service role can insert a row **with** `expires_at` and read it back.
- Authenticated + anonymous users still get `42501` on `ingest_tokens` (regression after the schema
  change).

**Done when:** `npm run test:ingest`, `npm run test:rls` (ingest), `npm run typecheck:functions`, and
`npm test` are green.

---

## Task 2 — `rotate-ingest-token` Edge Function

**Goal:** an authenticated function that mints a new token, expires the old one at `now + 24h`, and
returns the raw token once. Pure logic vitest-tested; transport `deno check`-ed.

**Files**
- NEW `supabase/functions/rotate-ingest-token/handler.ts` (pure)
- NEW `supabase/functions/rotate-ingest-token/handler.test.ts` (RED, vitest)
- NEW `supabase/functions/rotate-ingest-token/index.ts` (Deno transport)
- EDIT `supabase/config.toml` (add `[functions.rotate-ingest-token]` `verify_jwt = true`)
- EDIT `package.json` `typecheck:functions` to also `deno check` the two new files

**Pure handler**
```ts
export const TOKEN_GRACE_MS = 24 * 60 * 60 * 1000

export interface RotateStore {
  activeTokenHashes(userId: string): Promise<string[]>          // expires_at is null OR future
  expireTokens(hashes: string[], expiresAt: string): Promise<void>
  insertToken(row: { tokenHash: string; userId: string; label: string }): Promise<void>
}

export function generateToken(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): string
// base64url of 32 random bytes; url-safe, no padding.

export async function sha256Hex(value: string): Promise<string>  // same algo the ingest fn uses

export function rotationLabel(now: Date): string                 // e.g. "Rotated 2026-07-22"

export interface RotateResult { token: string }

export async function rotateIngestToken(
  userId: string,
  store: RotateStore,
  now: Date = new Date(),
  makeToken: () => string = generateToken,
): Promise<RotateResult> {
  const token = makeToken()
  const tokenHash = await sha256Hex(token)
  const active = await store.activeTokenHashes(userId)
  if (active.length > 0) {
    await store.expireTokens(active, new Date(now.getTime() + TOKEN_GRACE_MS).toISOString())
  }
  await store.insertToken({ tokenHash, userId, label: rotationLabel(now) })
  return { token }
}
```
Tests (vitest, in-memory `RotateStore`):
- mints via injected `makeToken`; inserts the hash of that token (assert `sha256Hex`), never the raw.
- expires **exactly** the active hashes with `now + TOKEN_GRACE_MS`.
- **first mint** (no active tokens): inserts, calls `expireTokens` **zero** times.
- label is the dated `rotationLabel(now)`.
- `generateToken` uses injected bytes, is url-safe base64, distinct across calls.

**Transport `index.ts` (mirrors ingest structure; not unit-tested — `deno check` only)**
- `POST` only (else 405).
- Resolve caller from the verified JWT:
  ```ts
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || user.is_anonymous) { /* 401 + AUTH_FAILURE_RATE_LIMIT */ }
  ```
- Rate-limit with a tight custom policy (rotation is rare), e.g. `ROTATE_RATE_LIMIT = { name:'rotate',
  limit: 5, windowMs: 60_000 }` (define locally or in `_shared/rateLimit.ts`).
- Service-role client implements `RotateStore`:
  - `activeTokenHashes`: `select token_hash from ingest_tokens where user_id = ? and (expires_at is
    null or expires_at > now())` — filter in the query; return hashes.
  - `expireTokens`: `update ingest_tokens set expires_at = ? where token_hash in (...)` (scoped to the
    user's hashes).
  - `insertToken`: `insert into ingest_tokens (token_hash, user_id, label)` — the existing
    `sync_ingest_status_on_token` trigger updates `ingest_status.token_label`.
- Respond `200 { token }` once. **Never** `console.*` the raw token.
- `config.toml`:
  ```toml
  # Authenticated token rotation: JWT-verified (unlike ingest, which uses the bearer scheme).
  [functions.rotate-ingest-token]
  verify_jwt = true
  ```

**Done when:** `npm run test:ingest` still green, new `rotate-ingest-token/handler.test.ts` green via
`npm test`, `npm run typecheck:functions` green (both new files added to the script).

---

## Task 3 — Client API + Settings UI + README

**Goal:** a Rotate/Generate button in Automatic Capture with a show-once token panel.

**Files**
- EDIT `src/api.ts` (+ `src/api.test.ts` RED)
- EDIT `src/screens/settings/IngestStatusCard.tsx` (+ `IngestStatusCard.test.tsx` RED)
- EDIT `src/index.css` (styles for the new controls, existing theme vars only)
- EDIT `README.md` (rotate instructions)

**Client API**
```ts
// src/api.ts
export async function rotateIngestToken(): Promise<{ token: string }> {
  await ensureUserId()
  const { data, error } = await getSupabase().functions.invoke('rotate-ingest-token', { method: 'POST' })
  if (error) {
    // FunctionsHttpError carries context.status; map like throwFrom (401/403 auth, 429 limited).
    const status = (error as { context?: { status?: number } }).context?.status
    throw new ApiError(status ?? 0, error.message)
  }
  const token = (data as { token?: unknown } | null)?.token
  if (typeof token !== 'string' || !token) throw new ApiError(0, 'rotate returned no token')
  return { token }
}
```
Tests (`api.test.ts`, mock `getSupabase().functions.invoke`): returns `{ token }` on success;
throws `ApiError` when `invoke` errors; throws when payload has no token.

**UI (`IngestStatusCard.tsx`)** — add below the existing `<dl>`:
- Button: label `Generate token` when `visibility?.state === 'unlinked'`, else `Rotate token`;
  hidden/disabled when `!currentUserId` (anonymous/no session), consistent with existing gating.
- On click → existing **confirm dialog** (reuse the app's confirm surface):
  *"Generate a new token? Your current token keeps working for 24 hours so you can update your iOS
  Shortcut."*
- On confirm → `rotateIngestToken()`, `setRotating(true)`; on success set `newToken`, on failure set
  an error notice (`role="alert"`), always clear `rotating`.
- **Show-once panel** (`newToken` set): read-only `<input>`/`<code>` with the token, a **Copy** button
  (`navigator.clipboard.writeText`), and text: *"Paste into your Shortcut's Authorization header as
  `Bearer <token>`. Your old token stops working in 24 hours. It won't be shown again."* A **Done**
  button clears `newToken` from state.
- After a successful rotation, refresh status (`refreshStatus()` bump) so `token_label` updates.
- Do **not** log or persist the token; hold it only in component state until dismissed.

Tests (`IngestStatusCard.test.tsx`, mock `rotateIngestToken` + `fetchIngestStatus`):
- unlinked → button reads "Generate token"; linked → "Rotate token".
- confirm → success renders the token text and a copy control; **Done** clears it.
- failure → error notice shown, no token rendered.
- no session / anonymous → control absent or disabled.
- accessible name on the button; token field is read-only.

**README:** in the Automatic Tracking / Shortcut section, document rotating the token (old works 24h;
update the Shortcut's `Bearer` header; the token is shown once).

**Done when:** `npm test`, `npm run lint`, `npm run build` all green.

---

## Cross-cutting / review checklist

- **Security:** raw token from CSPRNG, returned once, never stored/logged; only `sha256` persists.
  Rotation is JWT-verified and scoped to `auth.uid()`; `ingest_tokens` gains no client grants. Rate
  limited. Expiry enforced at the ingest boundary each request (no cleanup-job dependency).
- **Backward compatible:** `expires_at is null` = active; existing tokens keep working. Deploy order:
  migration → functions (`ingest` + `rotate-ingest-token`) → client.
- **No bundle risk:** UI change is Settings-only (lazy path), no new deps.
- **Tests:** unit (both handlers), client, component, RLS regression, `deno check`. Keep branch
  coverage ≥ project bar; new pure logic fully covered.
- **Docs/vault:** fold the token-lifecycle design intent into the `Serverless Backend` component note
  after merge (design-intent change).

## Deployment note (post-merge, human)

`npx supabase db push` (migration), `npx supabase functions deploy ingest rotate-ingest-token`, then
the client deploy (`npx vercel --prod`). The two shared users can then self-mint via **Generate
token**, closing part of T5.

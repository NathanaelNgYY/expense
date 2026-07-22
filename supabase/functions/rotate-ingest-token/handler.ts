// Pure rotation logic for the rotate-ingest-token Edge Function, kept separate from transport and
// storage so it is unit-testable without Deno/Supabase. The raw token is generated here, its hash
// is what gets stored, and the raw value is returned exactly once to the caller.

// How long a superseded token keeps working after a rotation, so an in-flight iOS Shortcut isn't
// cut off before the user updates its Authorization header. Confirmed 24h (S1 design).
export const TOKEN_GRACE_MS = 24 * 60 * 60 * 1000

export interface RotateStore {
  // Hashes of the user's tokens that are still valid (expires_at is null or in the future).
  activeTokenHashes(userId: string): Promise<string[]>
  // Set expires_at on the given token hashes (the old, superseded ones).
  expireTokens(hashes: string[], expiresAt: string): Promise<void>
  // Insert the freshly minted token (hash only — the raw value is never persisted).
  insertToken(row: { tokenHash: string; userId: string; label: string }): Promise<void>
}

export interface RotateResult {
  token: string
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// url-safe base64 (no +, /, or = padding) so the token drops cleanly into a Bearer header and a
// Shortcut text field.
function base64url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += BASE64URL[b0 >> 2]
    out += BASE64URL[((b0 & 0x03) << 4) | (b1 >> 4)]
    if (i + 1 < bytes.length) out += BASE64URL[((b1 & 0x0f) << 2) | (b2 >> 6)]
    if (i + 2 < bytes.length) out += BASE64URL[b2 & 0x3f]
  }
  return out
}

// 32 bytes of CSPRNG entropy, base64url-encoded (~43 chars). The byte source is injectable for
// deterministic tests.
export function generateToken(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): string {
  return base64url(bytes)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Dated label so ingest_status.token_label (kept in sync by the sync_ingest_status_on_token
// trigger) stays meaningful after a rotation.
export function rotationLabel(now: Date): string {
  return `Rotated ${now.toISOString().slice(0, 10)}`
}

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

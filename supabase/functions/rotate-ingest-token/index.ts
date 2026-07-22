// Supabase Edge Function: POST /functions/v1/rotate-ingest-token
// Authenticated (JWT-verified — unlike ingest, which uses the bearer-token scheme). Mints a new
// ingest token for the signed-in user, expires the previous one after a 24h grace window, and
// returns the raw token exactly once. ingest_tokens stays service-role only; every write here is
// scoped to the user id resolved from the verified JWT.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { rotateIngestToken, type RotateStore } from './handler.ts'
import {
  AUTH_FAILURE_RATE_LIMIT,
  checkRateLimit,
  rateLimitedResponse,
  type RateLimitPolicy,
} from '../_shared/rateLimit.ts'

// Rotation is a rare, deliberate action; keep the ceiling low so a stolen JWT can't churn tokens.
const ROTATE_RATE_LIMIT: RateLimitPolicy = { name: 'rotate', limit: 5, windowMs: 60_000 }

class SupabaseRotateStore implements RotateStore {
  constructor(private client: SupabaseClient, private nowIso: string) {}

  async activeTokenHashes(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('ingest_tokens')
      .select('token_hash')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${this.nowIso}`)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { token_hash: string }[]).map(row => row.token_hash)
  }

  async expireTokens(hashes: string[], expiresAt: string): Promise<void> {
    if (hashes.length === 0) return
    const { error } = await this.client
      .from('ingest_tokens')
      .update({ expires_at: expiresAt })
      .in('token_hash', hashes)
    if (error) throw new Error(error.message)
  }

  async insertToken(row: { tokenHash: string; userId: string; label: string }): Promise<void> {
    const { error } = await this.client
      .from('ingest_tokens')
      .insert({ token_hash: row.tokenHash, user_id: row.userId, label: row.label })
    if (error) throw new Error(error.message)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''

  // Resolve the caller from the verified JWT. A real (non-anonymous) account is required — an
  // ingest token belongs to a durable identity, so anonymous sessions cannot rotate one.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData.user
  if (!user || user.is_anonymous) {
    const limit = checkRateLimit(req, AUTH_FAILURE_RATE_LIMIT)
    if (limit.limited) return rateLimitedResponse(limit)
    return json({ error: 'unauthorized' }, 401)
  }

  const limit = checkRateLimit(req, ROTATE_RATE_LIMIT)
  if (limit.limited) return rateLimitedResponse(limit)

  // Service-role client for the ingest_tokens writes, scoped to the JWT's user id only.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const now = new Date()

  try {
    const { token } = await rotateIngestToken(
      user.id,
      new SupabaseRotateStore(admin, now.toISOString()),
      now,
    )
    // The raw token is returned once and never logged.
    return json({ token }, 200)
  } catch (error) {
    console.error('Token rotation failed:', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'rotation-failed' }, 500)
  }
})

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface StackCreds {
  url: string
  anonKey: string
  serviceRoleKey: string
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

let cached: StackCreds | null = null
const supabaseCli = resolve('node_modules/supabase/dist/supabase.js')

/**
 * These are security tests. If the stack is down we throw — never skip.
 * A skipped isolation test reports green while proving nothing.
 */
export function stackCreds(): StackCreds {
  if (cached) return cached

  let raw: string
  try {
    raw = execFileSync(process.execPath, [supabaseCli, 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(
      'Local Supabase stack is not running. Run `npx supabase start` first. ' +
        'These are RLS security tests and must never be skipped.',
    )
  }

  const status = JSON.parse(raw) as Record<string, string>
  const creds: StackCreds = {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  }

  if (!creds.url || !creds.anonKey || !creds.serviceRoleKey) {
    throw new Error('`supabase status` did not report API_URL, ANON_KEY and SERVICE_ROLE_KEY')
  }

  cached = creds
  return creds
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } }

/** Bypasses RLS. Fixtures and ground-truth verification ONLY — never to exercise a policy. */
export function serviceClient(): SupabaseClient {
  const { url, serviceRoleKey } = stackCreds()
  return createClient(url, serviceRoleKey, noPersist)
}

/** Unauthenticated. */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = stackCreds()
  return createClient(url, anonKey, noPersist)
}

/** A real confirmed user, returned with an anon-key client signed in as them — the app's own path. */
export async function signedInUser(): Promise<TestUser> {
  const { url, anonKey } = stackCreds()
  const email = `rls-${randomUUID()}@example.test`
  const password = randomUUID()

  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error

  const client = createClient(url, anonKey, noPersist)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  return { id: data.user!.id, email, client }
}

/** Deleting the auth user cascades their rows away. */
export async function deleteUser(user: TestUser): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(user.id)
  if (error) throw error
}

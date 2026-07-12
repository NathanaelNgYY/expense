// Mints an ingest bearer token for the iOS Shortcuts and registers its sha256 hash in
// the ingest_tokens table. The raw token is printed ONCE and never stored server-side.
//
// Usage (PowerShell, from the repo root):
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"
//   node scripts/mint-ingest-token.mjs <user-id> [label]
//
// Find the user id in Supabase dashboard > Authentication > Users (the account that
// opened the app), or via `select id from auth.users`.
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

const [userId, label = 'ios-shortcut'] = process.argv.slice(2)
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!userId || !url || !serviceKey) {
  console.error('usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/mint-ingest-token.mjs <user-id> [label]')
  process.exit(1)
}

const token = randomBytes(24).toString('base64url')
const tokenHash = createHash('sha256').update(token).digest('hex')

const admin = createClient(url, serviceKey)
const { error } = await admin.from('ingest_tokens').insert({ token_hash: tokenHash, user_id: userId, label })
if (error) {
  console.error('insert failed:', error.message)
  process.exit(1)
}

console.log('Ingest token registered for', userId, `(${label})`)
console.log('')
console.log('Put this in BOTH iOS Shortcuts as the Authorization header (shown once, save it now):')
console.log(`  Authorization: Bearer ${token}`)
console.log('')
console.log('Shortcut URL:', `${url}/functions/v1/ingest`)

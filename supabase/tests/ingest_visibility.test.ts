import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260713092121_ingest_visibility.sql'),
  'utf8',
)
const grantLockdownSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260713112626_lock_down_ingest_status_grants.sql'),
  'utf8',
)
const normalizedGrantLockdownSql = grantLockdownSql.replace(/\s+/g, ' ')
const anonLockdownSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260713112827_lock_down_ingest_status_anon_access.sql'),
  'utf8',
).replace(/\s+/g, ' ')

describe('ingest visibility migration', () => {
  it('creates status immediately when a new token is minted', () => {
    expect(sql).toContain('create trigger ingest_token_status_created')
    expect(sql).toContain('execute function public.sync_ingest_status_on_token()')
  })

  it('keeps the trigger helper unavailable to client roles', () => {
    expect(sql).toContain('revoke execute on function public.sync_ingest_status_on_token() from public, anon, authenticated')
  })

  it('allows authenticated users to select only their own status row', () => {
    expect(sql).toContain('alter table public.ingest_status enable row level security')
    expect(sql).toContain('using ((select auth.uid()) = user_id)')
    expect(sql).toContain('grant select on public.ingest_status to authenticated')
    expect(sql).not.toContain('grant select on public.ingest_tokens to authenticated')
  })

  it('explicitly revokes client write privileges on the status projection', () => {
    expect(normalizedGrantLockdownSql).toContain(
      'revoke insert, update, delete, truncate, references, trigger on public.ingest_status from anon, authenticated',
    )
    expect(grantLockdownSql).toContain('grant select on public.ingest_status to authenticated')
  })

  it('removes the legacy unauthenticated table grant', () => {
    expect(anonLockdownSql).toContain('revoke all privileges on public.ingest_status from anon')
  })
})

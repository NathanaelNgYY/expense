// Migration rehearsal seed. Paste the whole file into the browser devtools console on
// localhost:5173 (or a draft-deploy URL) BEFORE the app has created a Supabase session,
// then reload. It fakes the localStorage of a pre-Supabase user: cached entries, a queued
// offline mutation, poker sessions, and custom categories — everything the one-time
// migration (src/supabaseSync.ts) must carry to Supabase without losing a row.
//
// After reload, verify:
//   1. All 5 entries render immediately (cache-first).
//   2. supabase_migration_done:<user_id> appears in localStorage.
//   3. The entries + poker_sessions tables show the rows (Supabase dashboard).
//   4. The queued create ('q-offline-1') drains and appears on the server too.
//   5. Reload again: no duplicate rows (idempotency).
(() => {
  const day = offset => {
    const d = new Date(Date.now() - offset * 86400000)
    return d.toISOString().slice(0, 10)
  }

  localStorage.clear()

  localStorage.setItem('budget_entries', JSON.stringify([
    { id: 'seed-1', amount: 4.2, category: 'lunch', note: 'kopi + toast', date: day(1), source: 'manual', dedupeKey: 'manual:seed-1' },
    { id: 'seed-2', amount: 1.79, category: 'transport', note: 'MRT', date: day(1), source: 'apple-pay', merchant: 'TransitLink', dedupeKey: `apple_pay:${day(1)}:1.79:transitlink` },
    { id: 'seed-3', amount: 12.5, category: 'lunch', note: 'cai fan', date: day(2), source: 'dbs-email', merchant: 'Koufu', dedupeKey: `dbs_email:${day(2)}:12.50:koufu` },
    { id: 'seed-4', amount: 400, category: 'savings', note: 'monthly transfer', date: day(5), source: 'manual', dedupeKey: 'manual:seed-4' },
    // legacy-shaped entry: non-UUID id, no dedupeKey — the migration must still carry it
    { id: '1719812345678', amount: 8, category: 'others', note: 'legacy entry', date: day(30) },
  ]))

  // a mutation that was queued while offline and never sent
  localStorage.setItem('sync_queue', JSON.stringify([
    { op: 'create', entry: { id: 'q-offline-1', amount: 3.3, category: 'lunch', note: 'queued offline', date: day(0), source: 'manual', dedupeKey: 'manual:q-offline-1' } },
  ]))

  localStorage.setItem('poker_sessions', JSON.stringify([
    { id: 'poker-1', date: day(3), startTime: '20:00', endTime: '23:30', stakes: '0.1/0.2', buyIn: 20, result: 'win', amount: 34.5 },
    { id: 'poker-2', date: day(10), startTime: '21:00', endTime: '01:00', stakes: '0.2/0.5', buyIn: 50, result: 'loss', amount: 50 },
  ]))

  localStorage.setItem('budget_custom_categories', JSON.stringify([
    { id: 'cat_groceries_x7abc', label: 'Groceries', budget: 80, icon: 'shopping-cart' },
  ]))

  console.log('Seeded. Reload the page to run the migration.')
})()

# Staging Supabase migration fix — TDD evidence

## Source and journeys

Journeys were derived from the staging migration failure reported on 2026-07-11:

- A staging build must reject a production Supabase project URL.
- A legacy cache must migrate and verify before queued offline mutations are replayed.
- Authentication and migration failures must retain local data and emit safe diagnostics.

## RED / GREEN report

| Guarantee | Test target | RED evidence | GREEN evidence |
|---|---|---|---|
| Project reference is extracted and logged without a key | `src/lib/supabaseClient.test.ts` | Helper missing | Targeted suite passed |
| Wrong project reference is rejected | `src/lib/supabaseClient.test.ts` | Validator missing | Targeted suite passed |
| Migration runs before the offline queue | `src/EntriesContext.test.tsx` | Received `queue, migration` | Received `migration, queue` |
| Auth failure is logged and the queue survives | `src/EntriesContext.test.tsx` | No `console.error` call | Safe structured log asserted |

RED command:

```text
npm test -- --run src/lib/supabaseClient.test.ts src/EntriesContext.test.tsx
```

Result: 4 intended failures, 15 passes.

Targeted GREEN command:

```text
npm test -- --run src/lib/supabaseClient.test.ts src/supabaseSync.test.ts src/EntriesContext.test.tsx
```

Result: 29/29 tests passed.

Full GREEN command:

```text
npm test -- --testTimeout=15000
```

Result: 45/45 test files and 362/362 tests passed.

## Additional verification

- `npm run lint`: 0 errors; 3 pre-existing React hook warnings outside this fix.
- `npx netlify build --context production`: passed.
- Built bundle project: `rjwzzsocxykbfellsihr`; zero `sb_secret_` or service-role markers.
- Live deploy and stable site both serve the staging-only bundle and updated service worker.

## Coverage and gaps

The repository has no configured coverage script/provider, so a numeric coverage percentage was not produced. Browser migration rehearsal was not run because the Playwright Chrome extension is not installed. Unit/integration migration behavior and live bundle identity were verified.

No checkpoint commits were created because the worktree already contained overlapping uncommitted user changes.

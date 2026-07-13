# C2 ingest visibility — TDD evidence

## Acceptance criteria

- Settings identifies the account that receives iOS Shortcut transactions.
- Settings shows the latest successful or duplicate capture time and its source.
- Settings raises an explicit warning when the current app account differs from the device's remembered ingest account.
- Browser clients cannot read token hashes or write ingest status.
- A status-write failure cannot make a durable transaction capture fail.

## Design

`public.ingest_status` is a client-safe projection of ingest health. It contains only the account id, human-readable token label, last capture timestamp, and source. Row-level security permits authenticated users to select their own row only; no client write grant exists. `public.ingest_tokens` remains service-role-only and token hashes are never copied into the status table.

A locked-down invoker trigger initializes the projection when a token is minted. The ingest Edge Function then updates it after both saved and duplicate valid requests. That update is best-effort so visibility cannot interrupt expense capture.

The PWA remembers non-secret recipient metadata in a device-wide local storage key. This is intentionally outside the user-scoped financial cache so an account switch can be detected. The first authoritative binding is established when Settings is opened while signed into the linked account; before that, the UI conservatively reports the current account as unlinked.

## Red checkpoints

- `978a0b8 test: reproduce missing ingest visibility`
  - Missing visibility model and Settings card.
  - Missing `fetchIngestStatus` API.
  - Ingest handler did not record successful captures.
- `92a7665 test: require status on token creation`
  - Migration did not yet initialize status at token mint time or lock down the helper.

## Green checkpoints

- `e88efd5 feat: surface ingest account health`
- `a317527 fix: initialize status when tokens are minted`

## Verification

- Focused coverage: 48 tests passed.
  - Statements: 92.89%
  - Branches: 80.10%
  - Functions: 100%
  - Lines: 100%
- Full suite: 54 files, 457 tests passed.
- ESLint: passed with zero source errors. Coverage artifacts were removed before the final lint run.
- TypeScript and Vite production build: passed.
- Linked Supabase security advisors: no errors; only pre-existing project warnings were reported before deployment.

## Deployment boundary

The migration and Edge Function source are ready locally. Applying `20260713092121_ingest_visibility.sql` and deploying the updated `ingest` function mutate the linked Supabase project and therefore require explicit deployment approval.

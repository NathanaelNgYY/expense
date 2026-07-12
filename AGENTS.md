# AGENTS.md

Guidance for coding agents (Codex, Claude Code) working in this repo.

> **This file is the source of truth.** The `CLAUDE.md` one directory up imports it. Edit this file;
> don't fork the content.
>
> All paths and commands below are relative to **this directory** (`budget-tracker/`), which is the git
> repo root. If you are working from the parent `BudgetTracking/` wrapper directory, `cd budget-tracker`
> first.

## What this is

A personal, iPhone-friendly **budget tracker**: a React 19 + Vite PWA backed by a small **Netlify
Functions / Netlify Blobs** serverless API. It tracks a S$1,200/month budget across categories (lunch,
transport, savings, investments, others; a *buffer* is computed, not stored), captures transactions
automatically in the background from iOS Shortcuts, and includes a poker-session tracker + spending
insights.

## Planned direction — Supabase migration (App Store plan ON HOLD)

**The PWA is the product.** The App Store / SwiftUI rewrite plan (`docs/APP_STORE.md`) was put
**on hold on 2026-07-10** — the owner has no macOS hardware to build/sign/submit iOS apps. Its task
IDs (`T-01`–`T-35`) and gates are dormant; don't block PWA work on them or pick up `T-` tasks unless
the hold is explicitly lifted.

The active plan of record is **migrating the personal-data backend (entries CRUD, ingest) from
Netlify Functions/Blobs to Supabase**, joining `src/sharedBudgets/` which already runs on Supabase.
Spec: `docs/superpowers/specs/2026-07-11-supabase-migration.md` — read it before touching backend,
sync, or storage code. Hard constraints:

- **The app's URL must not change** until every user's localStorage data has migrated —
  localStorage is origin-scoped and is the only copy of non-owner users' data.
- **Never clear localStorage**; it remains the offline cache after migration.
- The user-side migration is a one-time idempotent upload (preserve `id` + `dedupeKey`) behind a
  **new** flag key (`migration_done` is already taken by the old localStorage→Netlify migration).
- iOS Shortcuts keep the same `Bearer` token auth; only the ingest URL changes.

## Commands

```bash
npm install
npm run dev        # Vite UI only, http://localhost:5173 — /api/* not running, app uses localStorage cache
npx netlify dev    # full stack (UI + functions + local Blobs), http://localhost:8888; set INGEST_TOKEN first
npm test           # vitest run (unit + integration tests live next to source as *.test.ts[x])
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the production build, http://localhost:4173
npm run lint       # eslint
```

`netlify dev` needs an ingest token: PowerShell `$env:INGEST_TOKEN = "devtoken"` (or `export INGEST_TOKEN=devtoken`).

## Architecture (skeleton — file maps are in the vault Component notes)

- **Client state/sync** (offline-first EntriesContext, sync queue, API client) → vault `Components/Client State & Sync.md`
- **Domain math** (`compute.ts`, poker analytics; nothing derived is persisted) → `Components/Client Domain Logic.md`
- **Shared client+server helpers** (`src/shared/`: DBS email parsing, dedupeKey, SGT dates) → `Components/Shared Domain Helpers.md`
- **Netlify Functions backend** (`entries` CRUD over Blobs, idempotent `ingest`) → `Components/Serverless Backend.md`
- **UI shell + screens** → `Components/UI Layer.md`
- **Background ingestion**: two iOS Shortcuts POST to `/api/ingest` — Apple Pay (Wallet trigger) and DBS
  transaction-alert emails (no native PayNow trigger). Full Shortcut setup in `README.md`.

## Conventions

- TypeScript throughout; tests are colocated `*.test.ts(x)` run by Vitest.
- Client and server share types/logic via `src/shared/` and `src/types.ts` — change them in one place.
- All date/budget logic is **SGT-local** via `shared/sgtDate.ts`; don't reintroduce raw `Date` math.
- Server entries are keyed/deduped by `dedupeKey`; preserve `id` and `dedupeKey` on updates.

## Knowledge layers — Obsidian (design intent) + Graphify (code structure)

Context for this repo lives in **two complementary layers**. Use the right one and you avoid sweeping raw source:

- **Obsidian vault = design intent ("why").** Hub + per-component notes capture rationale that isn't in the code. **Hand-maintained**, changes rarely (only on architecture decisions). Read these FIRST for orientation.
  - Vault project folder: `C:\Users\natha\OneDrive\Desktop\Obsidian Vault\BudgetTracking`
- **Graphify = code structure ("what connects to what").** Files, functions, classes, calls, imports — extracted from the AST and **rebuilt automatically** by a git `post-commit` hook (and `graphify watch` during active dev). Query it instead of grepping. **Never hand-maintained.**

> **Important:** there is **no per-source-file leaf-note rule.** Do *not* create/update Obsidian "leaf notes" when you add or change a file — Graphify owns that layer, for free and always-current. Only keep the hub + component notes in sync, and only when *design intent* changes.

### Reading for context (orientation)

Read the hub + the relevant `Components/<X>.md` note (design intent). For *structure* — which file/function calls or imports what — **query Graphify**, don't bulk-read source. Run these from this directory:

- `graphify query "<question>" --graph graphify-out/graph.json --budget 800` — targeted subgraph for a question
- `graphify explain "<Symbol>" --graph graphify-out/graph.json` — a node and its neighbors
- `graphify path "A" "B" --graph graphify-out/graph.json` — how two symbols connect
- `graphify affected "<Symbol>" --graph graphify-out/graph.json` — reverse impact ("what breaks if I change this")
- Live in-session (Claude Code only): the **`graphify` MCP server** is registered (local scope) and exposes these as tools after a restart.

### Maintenance

- Graph rebuilds automatically on commit (git hook). During active dev, run `graphify watch .` for live save-time rebuilds.
- After a refactor that deletes code, run `graphify update . --force` to prune the graph.
- `graphify-out/` is gitignored (rebuilt locally; not committed).
- The **only** hand-maintained vault work: create `Components/<Name>.md` for a new top-level dir, and fold design-intent changes into the matching component note. No per-file notes.

## Process artifacts

- Plans and specs → `docs/superpowers/{plans,specs}/`, dated filenames.
- Durable design intent ("how the system works today / why a decision was made") → the Obsidian vault, folded into the matching Component/Concept note.

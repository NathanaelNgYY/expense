# AGENTS.md

Guidance for coding agents (Codex, Claude Code) working in this repo.

> **This file is the source of truth.** The `CLAUDE.md` one directory up imports it. Edit this file;
> don't fork the content.
>
> All paths and commands below are relative to **this directory** (`budget-tracker/`), which is the git
> repo root. If you are working from the parent `BudgetTracking/` wrapper directory, `cd budget-tracker`
> first.

## What this is

A personal, iPhone-friendly **budget tracker**: a React 19 + Vite PWA hosted on **Vercel** with
**Supabase** for personal entries, shared budgets and background ingestion. It tracks a S$1,200/month budget across categories (lunch,
transport, savings, investments, others; a *buffer* is computed, not stored), captures transactions
automatically in the background from iOS Shortcuts, and includes a poker-session tracker + spending
insights.

## Current direction — Supabase/Vercel PWA (App Store plan ON HOLD)

**The PWA is the product.** The App Store / SwiftUI rewrite plan (`docs/APP_STORE.md`) was put
**on hold on 2026-07-10** — the owner has no macOS hardware to build/sign/submit iOS apps. Its task
IDs (`T-01`–`T-35`) and gates are dormant; don't block PWA work on them or pick up `T-` tasks unless
the hold is explicitly lifted.

The personal-data backend migration (entries CRUD and ingest) to Supabase is complete in production,
joining `src/sharedBudgets/`. Hosting runs on Vercel, and the retired serverless runtime has been
removed. The point-in-time migration design remains at
`docs/superpowers/specs/2026-07-11-supabase-migration.md`; read it before touching backend, sync, or
storage code. Hard constraints:

- **Never clear localStorage**; it remains the offline cache after migration.
- The user-side migration is a one-time idempotent upload (preserve `id` + `dedupeKey`) behind a
  **new** flag key (`migration_done` is already taken by the old localStorage→Netlify migration).
- iOS Shortcuts keep the same `Bearer` token auth; only the ingest URL changes.

Hosting moved to Vercel per the historical design in
`docs/superpowers/specs/2026-07-12-vercel-prod-cutover-design.md`.

## Commands

```bash
npm install
npm run dev        # Vite UI, http://localhost:5173; backend calls use the configured Supabase project
npm test           # vitest run (unit + integration tests live next to source as *.test.ts[x])
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the production build, http://localhost:4173
npx vercel --prod  # deploy to Vercel production
npm run lint       # eslint
```

## Architecture (skeleton — file maps are in the vault Component notes)

- **Client state/sync** (offline-first EntriesContext, sync queue, API client) → vault `Components/Client State & Sync.md`
- **Domain math** (`compute.ts`, poker analytics; nothing derived is persisted) → `Components/Client Domain Logic.md`
- **Shared client+server helpers** (`src/shared/`: DBS email parsing, dedupeKey, SGT dates) → `Components/Shared Domain Helpers.md`
- **Supabase backend** (`entries` CRUD with RLS, idempotent Edge Function ingest) → `Components/Serverless Backend.md`
- **UI shell + screens** → `Components/UI Layer.md`
- **Background ingestion**: two iOS Shortcuts POST to the Supabase `ingest` Edge Function — Apple Pay (Wallet trigger) and DBS
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

- Design specs → `docs/superpowers/specs/`, dated filenames. Completed implementation plans live in Git history.
- Durable design intent ("how the system works today / why a decision was made") → the Obsidian vault, folded into the matching Component/Concept note.

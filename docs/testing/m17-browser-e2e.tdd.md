# M17 browser E2E and accessibility — TDD evidence

**Date:** 2026-07-14

**Runner:** Playwright 1.61.1, mobile Chromium using the iPhone 13 device profile

**Accessibility engine:** axe-core 4.12.1, WCAG A/AA tags

## Scope

- First-run empty state through saving a personal expense.
- H6 Others/Buffer presentation in the rendered dashboard.
- History edit, delete, and Undo.
- Settings month reset and Undo with entry ids preserved.
- Page-level headings on Dashboard, Add entry, History, and Settings.
- Automated WCAG A/AA checks, keyboard focus order, accessible control names,
  and measured 44 by 44 pixel targets for critical mobile controls.

Tests abort every Supabase request and seed only browser `localStorage`. This keeps
the suite deterministic, proves offline-first behavior, and prevents local or CI
runs from writing to a deployed environment.

## RED → GREEN evidence

| Phase | Result | Evidence |
| --- | --- | --- |
| RED | All four journeys passed after correcting two locator ambiguities; accessibility still failed because primary screens had no `<h1>` and Settings/month controls rendered at 34 by 34 pixels. | Commit `088ed7d`; `npm run test:e2e` failed on the heading and touch-target assertions. |
| GREEN | Added semantic page headings and made the critical controls expose real 44 by 44 boxes. Axe reported no WCAG A/AA violations on the four tested screens. | `npm run test:e2e`: 7 passed. |

## CI contract

The parallel `e2e` job installs Chromium, runs `npm run test:e2e`, and retains the
HTML report, failure screenshots, videos, and traces for 14 days. The RLS job now
uses `supabase/setup-cli@v2`, which avoids the deprecated Node 20 action runtime
and resolves the CLI version from `package-lock.json`.

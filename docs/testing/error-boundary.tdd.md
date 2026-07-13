# H8 root error boundary — TDD evidence

## Source

The user journeys were derived from H8 in the production-readiness audit dated 2026-07-13 and the agreed first phase: ship dependency-free crash recovery before configuring an external monitoring account.

## User journeys

- As a user, I want an unexpected screen or provider render failure to show recovery controls instead of a blank PWA.
- As a user, I want to reload the app or download my full local JSON backup from the crash screen.
- As a user, I must not see stack traces or internal error messages.
- As a developer, I want the original error and React component stack logged for diagnosis.

## RED checkpoint

- `74ea1c0 test: reproduce blank-screen crash handling`
- Command: `npm test -- --run src/components/AppErrorBoundary.test.tsx`
- Result: the suite failed at import because no root error-boundary component existed.

## GREEN checkpoints

- `62c3850 fix: recover from root render crashes`
  - Added a class-based React boundary around all providers and screens.
  - Added a friendly fallback with Reload app and Download backup actions.
  - Kept technical error details out of the UI and logged the error plus component stack.
- `cce2379 refactor: inject crash recovery actions`
  - Injected reload and backup actions at the app root for explicit behavior and complete testability.

## Test specification

| Guarantee | Test target | Type | Result |
|---|---|---|---|
| Children render unchanged when no exception occurs | `AppErrorBoundary.test.tsx` | Component | PASS |
| A render exception produces a recovery screen rather than a blank tree | `AppErrorBoundary.test.tsx` | Component | PASS |
| Internal error text is absent from the user-facing fallback | `AppErrorBoundary.test.tsx` | Component | PASS |
| Reload and full-backup actions remain usable after a crash | `AppErrorBoundary.test.tsx` | Component | PASS |
| Developer reporting receives the original error and component stack | `AppErrorBoundary.test.tsx` | Component | PASS |
| The normal root App continues to render | `App.test.tsx` | Integration | PASS |

## Verification

- Focused tests: 3 files, 23 tests passed.
- Boundary coverage: 100% statements, branches, functions, and lines.
- Full suite: 55 files, 470 tests passed.
- ESLint: passed with zero warnings.
- TypeScript and Vite production build: passed.

## Known gaps

- React error boundaries catch render, constructor, and lifecycle failures below them; they do not catch event-handler errors or arbitrary rejected promises.
- The boundary now reports through the Sentry integration. The EU project and Vercel variables are configured; remote delivery begins with the next deployment. See `docs/testing/sentry-monitoring.tdd.md`.

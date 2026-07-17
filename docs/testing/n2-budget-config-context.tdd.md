# N2 reactive budget-config context — TDD evidence

**Date:** 2026-07-17

**Source:** `docs/superpowers/specs/2026-07-17-n2-budget-config-context-design.md`

## User journeys

1. As a user editing budgets and categories, I want mounted screens to reflect a save immediately.
2. As a user importing a JSON backup, I want imported budget settings to enter reactive state without a remount.
3. As a user switching accounts, I want budget settings to reload from the newly active user's namespace.
4. As a returning user, I want persisted budget settings parsed once on provider mount and only re-read after an explicit reload or user switch.

## Task report

| Stage | Execution summary | Command | Result |
| --- | --- | --- | --- |
| RED | Added five context guarantees before the module existed. | `npm test -- src/BudgetConfigContext.test.tsx` | **FAIL as intended:** import resolution failed for the missing `BudgetConfigContext` module. |
| GREEN | Added the combined context, active-user subscription, provider wiring, consumer rewires, JSON-import reload, and context-aware test rendering. | `npm test -- src/BudgetConfigContext.test.tsx src/App.test.tsx src/screens/Dashboard.test.tsx src/screens/History.test.tsx src/screens/Insights.test.tsx src/screens/AddEntry.test.tsx src/components/InsightsSection.test.tsx src/screens/Settings.test.tsx src/screens/settings/AutomaticCaptureSettings.test.tsx src/screens/settings/BudgetSettings.test.tsx src/screens/settings/DataSettings.test.tsx` | **PASS:** 11 files / 98 tests. |
| Regression | Ran the complete unit/integration suite. | `npm test` | **PASS:** 67 files / 550 tests. |
| Quality | Checked static analysis and the production bundle. | `npm run lint`; `npm run build` | **PASS:** lint clean; TypeScript and Vite production build complete. |
| Coverage | Ran the full instrumented suite with bounded worker concurrency. | `npm run test:coverage -- --maxWorkers=4` | **PASS:** 67 files / 550 tests; all repository thresholds exceeded. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Provider mount seeds config, custom categories, and overrides from the existing storage getters. | `BudgetConfigContext.test.tsx: seeds all reactive values from storage on mount` | Component | PASS |
| 2 | Each context setter both persists its value and re-renders consumers. | `BudgetConfigContext.test.tsx: individual setters persist and re-render consumers` | Component | PASS |
| 3 | `saveBudgets` publishes one complete snapshot rather than three partial React states. | `BudgetConfigContext.test.tsx: saveBudgets persists and publishes one complete snapshot` | Component | PASS |
| 4 | `reload` observes out-of-band writes such as JSON import. | `BudgetConfigContext.test.tsx: reload picks up storage writes made outside the context` | Component | PASS |
| 5 | A real active-user transition reloads config from the new user-scoped namespace. | `BudgetConfigContext.test.tsx: reloads the new namespace when the active user changes` | Integration | PASS |
| 6 | Existing screen behavior and storage persistence remain intact after consumers move to context. | Affected-screen target and full Vitest suite | Regression | PASS |

## Coverage and known gaps

- Whole-project coverage: 85.38% statements, 77.89% branches, 84.33% functions, and 88.87% lines.
- The first unconstrained coverage run had one instrumentation-timeout failure in `Settings.test.tsx`; that file passed alone under coverage, and the complete suite passed with `--maxWorkers=4`.
- No browser/manual account-switch check was run locally. The context integration test uses the real storage namespace transition and validates the rendered result.
- Splitting `Dashboard.tsx` and `History.tsx` remains outside N2, as specified.

## Merge evidence

- RED checkpoint: `7b91ebf test: add RED coverage for reactive budget config context`
- GREEN checkpoint: `c258bd2 feat: add reactive budget config context`

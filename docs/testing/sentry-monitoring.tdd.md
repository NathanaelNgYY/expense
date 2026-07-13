# H8 Sentry monitoring — TDD evidence

## User journeys

- As the app owner, I want root React crashes reported remotely so failures can be diagnosed after users leave the page.
- As a user, I do not want budget entries or default personally identifiable information attached to crash reports.
- As a developer, I want production source maps uploaded securely so minified stack traces remain useful.
- As a developer without Sentry credentials locally, I want the app to run normally with monitoring disabled.

## RED checkpoint

- Commit: `f9336bb test: specify Sentry crash reporting`
- Command: `npm test -- --run src/monitoring.test.ts`
- Result: failed because `src/monitoring.ts` did not exist.

## GREEN checkpoint

- Commit: `6485bed feat: report app crashes to Sentry`
- Focused command: `npm test -- --run src/monitoring.test.ts src/components/AppErrorBoundary.test.tsx src/App.test.tsx`
- Result: 3 files and 10 tests passed.

## Guarantees

| Guarantee | Evidence | Result |
|---|---|---|
| No DSN leaves monitoring disabled and does not initialize Sentry | `monitoring.test.ts` | PASS |
| A configured DSN initializes Sentry without default PII or performance traces | `monitoring.test.ts` | PASS |
| Root React errors include the component stack but no budget state | `monitoring.test.ts` | PASS |
| A missing React component stack is handled safely | `monitoring.test.ts` | PASS |
| Existing crash fallback and root app behavior remain intact | focused boundary/App tests | PASS |
| Optional source-map configuration type-checks and builds | `npm run build` | PASS |

## Final verification

- Monitoring coverage: 100% statements, branches, functions and lines.
- Full suite: 56 files and 473 tests passed.
- ESLint: passed with zero warnings.
- TypeScript and Vite production build: passed.
- `npm audit`: 10 pre-existing findings (1 low, 7 moderate, 2 high); no finding was attributed to an `@sentry/*` package.

## External boundary

The EU Sentry project `nee-x7/budget-tracker` now exists. `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and the sensitive `SENTRY_AUTH_TOKEN` are configured in both Vercel Production and Preview. The token has only the organization `org:ci` scope used for source-map upload. No deployment was performed, so live event delivery and source-map upload remain to be verified after the next approved deploy.

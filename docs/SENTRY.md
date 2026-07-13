# Sentry error monitoring

The app initializes `@sentry/react` before React renders and reports root-boundary crashes with the React component stack. Monitoring is disabled automatically when `VITE_SENTRY_DSN` is absent.

## Privacy defaults

- `sendDefaultPii` is disabled.
- Performance tracing is disabled (`tracesSampleRate: 0`).
- Crash reports attach only the exception and React component stack. Budget entries, amounts and application state are not added as context.

## Connect the Sentry project

1. In Sentry, create a **React** project named `budget-tracker`.
2. Copy its client DSN.
3. In Vercel, open the Budget Tracker project and add these environment variables:

   | Variable | Visibility | Purpose |
   |---|---|---|
   | `VITE_SENTRY_DSN` | Client-safe | Sends browser exceptions to the Sentry project |
   | `SENTRY_ORG` | Build only | Identifies the Sentry organization for source maps |
   | `SENTRY_PROJECT` | Build only | Set to the Sentry project slug, normally `budget-tracker` |
   | `SENTRY_AUTH_TOKEN` | Secret | Uploads source maps during the production build |

4. Apply them to Production and Preview, then redeploy. Never prefix the auth token with `VITE_`; Vite variables with that prefix are exposed to browsers.

The Vite plugin activates source-map generation only when all three build-only variables are present. It uploads hidden source maps and deletes them from `dist` after upload.

## Verify after deployment

Use a temporary preview-only code change to call `Sentry.captureException(new Error('Sentry verification'))`, deploy the preview, confirm the event arrives with a readable source stack, and then remove the temporary call. Do not add a public production crash-test route.

Official references: [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/) and [Sentry source maps](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/).

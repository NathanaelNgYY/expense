# Sentry error monitoring

The app initializes `@sentry/react` before React renders and reports root-boundary crashes with the React component stack. Monitoring is disabled automatically when `VITE_SENTRY_DSN` is absent.

## Current connection

- Sentry organization: `nee-x7`
- Sentry project: `budget-tracker`
- Data region: European Union
- Vercel environments configured: Production and Preview
- Source-map token: organization-scoped `org:ci`, stored only as a sensitive Vercel variable
- Production alias: `https://budget-tracker-sooty-ten.vercel.app`
- Production status: deployed and smoke-tested on 2026-07-13; source-map upload verified
- CSP requirement: `connect-src` allows only the configured EU ingestion origin,
  `https://o4511727901736960.ingest.de.sentry.io`, in addition to the app and Supabase.

These settings are active in production. No token or private credential is committed to the repository.

## Privacy defaults

- `sendDefaultPii` is disabled.
- Performance tracing is disabled (`tracesSampleRate: 0`).
- Crash reports attach only the exception and React component stack. Budget entries, amounts and application state are not added as context.

## Reconnect or rotate the Sentry project

1. In Sentry, create or select a **React** project named `budget-tracker`.
2. Copy its client DSN.
3. In Vercel, open the Budget Tracker project and add these environment variables:

   | Variable | Visibility | Purpose |
   |---|---|---|
   | `VITE_SENTRY_DSN` | Client-safe | Sends browser exceptions to the Sentry project |
   | `SENTRY_ORG` | Build only | Identifies the Sentry organization for source maps |
   | `SENTRY_PROJECT` | Build only | Set to the Sentry project slug, normally `budget-tracker` |
   | `SENTRY_AUTH_TOKEN` | Secret | Uploads source maps during the production build |

4. Update the exact Sentry DSN origin in `vercel.json`'s `connect-src` directive if the project or region changed.
5. Apply the variables to Production and Preview, then redeploy. Never prefix the auth token with `VITE_`; Vite variables with that prefix are exposed to browsers.

The Vite plugin activates source-map generation only when all three build-only variables are present. It uploads hidden source maps and deletes them from `dist` after upload.

## Verify after deployment

Use a temporary preview-only code change to call `Sentry.captureException(new Error('Sentry verification'))`, deploy the preview, confirm the event arrives with a readable source stack, and then remove the temporary call. Do not add a public production crash-test route.

Official references: [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/) and [Sentry source maps](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/).

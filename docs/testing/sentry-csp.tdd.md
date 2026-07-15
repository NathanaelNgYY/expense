# Sentry CSP connection — TDD evidence

**Date:** 2026-07-15

**Source:** Read-only production browser QA found that the deployed `connect-src` directive blocked the configured EU Sentry envelope endpoint.

## User journey

As the app owner, I want production browser exceptions to reach the configured Sentry project so deployed failures remain observable without weakening unrelated browser security boundaries.

## Security decision

- Allow the exact configured origin: `https://o4511727901736960.ingest.de.sentry.io`.
- Preserve the existing self and Supabase HTTPS/WSS sources.
- Do not allow broad sources such as `https://*.sentry.io`, `https:`, or `*`.
- Leave every non-connection CSP directive unchanged.

## RED → GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npm test -- src/vercelSecurityHeaders.test.ts` | Expected failure | `connect-src` contained only self and Supabase; the exact Sentry ingestion origin was missing. |
| GREEN | `npm test -- src/vercelSecurityHeaders.test.ts` | 1 file and 1 test passed | The complete connection allowlist matches self, Supabase HTTPS/WSS, and the single configured Sentry origin. |
| Coverage | `npm run test:coverage` | 61 files and 504 tests passed | 84.50% statements, 77.34% branches, 83.14% functions, and 88.09% lines. |
| Static verification | `npm run lint` | Passed | ESLint reports no violations. |
| Production build | `npm run build` | Passed | TypeScript and Vite production build completed successfully. |
| Dependency audit | `npm audit --audit-level=high` | Passed | Zero vulnerabilities reported. |
| Diff review | `git diff --check main...HEAD` and changed-diff secret/debug scan | Passed | No whitespace errors or secret/debug markers were found. |

## Test specification

| # | What is guaranteed | Test | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Sentry's configured EU envelope origin is permitted by the deployed CSP configuration. | `src/vercelSecurityHeaders.test.ts` | Security configuration regression | PASS |
| 2 | The connection allowlist cannot silently broaden beyond the four reviewed sources. | `src/vercelSecurityHeaders.test.ts` | Security boundary regression | PASS |
| 3 | Other CSP directives remain unchanged by the implementation diff. | `git diff main...HEAD -- vercel.json` | Manual diff review | PASS |

## Production acceptance

After deployment, read-only browser QA must confirm that the response CSP contains the exact Sentry origin and that the previous CSP refusal no longer appears in the console. A synthetic production exception is intentionally not generated; event-delivery verification should use the documented preview-only procedure.

## Merge evidence

- RED checkpoint: `c523c74 test: reproduce blocked Sentry CSP origin`
- GREEN checkpoint: `f87f477 fix(security): allow Sentry ingestion in CSP`

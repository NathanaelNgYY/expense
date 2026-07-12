# Vercel deploy dependency fix — TDD evidence

**Source plan:** `docs/superpowers/plans/2026-07-12-vercel-prod-cutover.md`, Task 8.

## User journey

As the owner, I want Vercel to install and build the locked dependencies so the production PWA can deploy reproducibly.

## RED / GREEN evidence

| Guarantee | Validation | Result | Evidence |
|---|---|---|---|
| A clean Vercel environment can resolve the Vite/PWA peer graph | Vercel production build | RED before fix | `npm install` failed with `ERESOLVE`: `vite-plugin-pwa@1.2.0` did not support Vite 8. |
| The supported PWA plugin remains compatible with the application | `npm test -- --run` | PASS | 46 files and 392 tests passed with `vite-plugin-pwa@1.3.0`. |
| Static analysis remains clean | `npm run lint` | PASS | ESLint exited successfully. |
| The production PWA bundle still builds | `npm run build` | PASS | Vite 8 built successfully; PWA 1.3.0 generated `sw.js` and the Workbox bundle. |

## Coverage and known gaps

No new business logic was introduced, so no new unit test was appropriate and coverage was not rerun. The full existing suite exercises the PWA-enabled Vite configuration, while the production redeploy is the clean-install integration check.

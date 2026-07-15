# H9 CI enforcement — TDD evidence

**Date:** 2026-07-14

## Acceptance criteria

- A high- or critical-severity dependency advisory fails CI.
- The `verify`, `rls`, and `e2e` jobs remain present as independent gates.
- CI continues to run for pull requests targeting `main`.
- Repository-level required checks are enabled when the current GitHub repository plan permits them; otherwise the exact platform limitation is recorded.

## Red

`npx vitest run src/ciWorkflow.test.ts` failed because the `Audit dependencies` step still contained `continue-on-error: true`. The other four workflow assertions passed.

## Green

- Removed `continue-on-error` from `npm audit --audit-level=high`.
- Added five static workflow regression tests covering the blocking audit, all three CI jobs, and the pull-request trigger.
- `npm audit --audit-level=high` reports 0 vulnerabilities.

## GitHub enforcement boundary

The authenticated GitHub API initially rejected both the branch-protection and repository-rulesets endpoints with HTTP 403 while the repository was private. After the owner made the repository public on 2026-07-15, `main` branch protection was enabled with strict required `verify`, `rls`, and `e2e` checks, administrator enforcement, force-push protection, and deletion protection.

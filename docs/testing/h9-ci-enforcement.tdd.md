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

The authenticated GitHub API rejected both the branch-protection and repository-rulesets endpoints with HTTP 403: “Upgrade to GitHub Pro or make this repository public to enable this feature.” The CI jobs therefore enforce failures on every push and pull request, but GitHub cannot make those checks merge-required on this private repository under the current account plan.

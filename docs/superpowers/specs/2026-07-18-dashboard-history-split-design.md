# Dashboard and History maintainability split

## Goal

Reduce the two largest screen modules without changing user-visible behavior.

## User journeys preserved

- A user can inspect, expand, and delete personal or shared budget entries from Home.
- A user can search, filter, edit, delete, undo, and add transactions from History.

## Boundaries

- Keep Dashboard.tsx and History.tsx as route-level orchestration components.
- Extract cohesive presentational sections and their narrowly scoped helpers.
- Preserve the existing public screen props, copy, CSS class names, and accessibility semantics.
- Add focused component tests before extraction, then run the existing screen suites as regression proof.
- Do not change finance calculations, persistence, styling, or navigation.

## Acceptance criteria

1. Extracted modules have direct behavioral tests.
2. Existing Dashboard and History tests remain green without weakened assertions.
3. Both screen files are materially smaller and easier to scan.
4. Lint, typecheck/build, and coverage gates pass.

// src/screens/settings/parseOptionalBudget.ts
// An empty budget field means "no budget", not zero — shared by the personal and
// shared budget editors so the two can never drift apart.
export function parseOptionalBudget(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Math.max(0, parseFloat(trimmed) || 0)
}

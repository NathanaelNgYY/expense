const NUMERIC_STAKES_PATTERN = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/

export function formatStakesLabel(stakes: string): string {
  if (stakes.startsWith('$') || !NUMERIC_STAKES_PATTERN.test(stakes)) return stakes
  return `$${stakes}`
}

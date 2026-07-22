// src/deepLink.ts
// Pure parsing/resolution for the quick-add deep link (?add=true&category=&amount=).
// No DOM dependency: callers pass location.search so this stays unit-testable.

export interface AddDeepLink {
  add: boolean
  amount?: number
  category?: string
}

// Truncate to 2 decimals without floating-point drift (5.8*100 = 579.9999… in JS).
function truncate2(n: number): number {
  return Math.floor(n * 100 + 1e-6) / 100
}

export function parseAddDeepLink(search: string): AddDeepLink {
  const params = new URLSearchParams(search)
  const result: AddDeepLink = { add: params.get('add') === 'true' }

  const rawAmount = params.get('amount')
  if (rawAmount !== null) {
    const n = Number(rawAmount)
    if (Number.isFinite(n) && n > 0) {
      const truncated = truncate2(n)
      if (truncated > 0) result.amount = truncated
    }
  }

  const rawCategory = params.get('category')
  if (rawCategory !== null) {
    const trimmed = rawCategory.trim()
    if (trimmed) result.category = trimmed
  }

  return result
}

// Case-insensitive match against each option's id first, then its label.
export function resolveCategoryId(
  raw: string,
  options: ReadonlyArray<{ id: string; label: string }>,
): string | null {
  const needle = raw.trim().toLowerCase()
  if (!needle) return null
  const byId = options.find(o => o.id.toLowerCase() === needle)
  if (byId) return byId.id
  const byLabel = options.find(o => o.label.toLowerCase() === needle)
  return byLabel ? byLabel.id : null
}

// Number -> the `digits` string AddEntry seeds, honouring the <=2-decimal numpad rule.
export function amountToDigits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  return String(truncate2(n))
}

export function normalizeMerchant(value: string): string {
  return (
    value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
  )
}

export type DedupeSource = 'apple_pay' | 'dbs_email' | 'manual'

export function buildDedupeKey(
  source: DedupeSource,
  date: string,
  amount: number,
  merchant: string,
  id = '',
): string {
  if (source === 'manual') {
    return `manual:${id}`
  }
  return `${source}:${date}:${amount.toFixed(2)}:${normalizeMerchant(merchant)}`
}

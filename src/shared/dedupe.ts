export function normalizeMerchant(value: string): string {
  return (
    value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
  )
}

export type DedupeSource = 'apple_pay' | 'dbs_email' | 'manual'

export async function fingerprintIngestEvent(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function buildDedupeKey(
  source: DedupeSource,
  occurrence: string,
  amount: number,
  merchant: string,
  id = '',
): string {
  if (source === 'manual') {
    return `manual:${id}`
  }
  if (id) return `${source}:event:${id}`
  return `${source}:${occurrence}:${amount.toFixed(2)}:${normalizeMerchant(merchant)}`
}

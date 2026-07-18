export type DbsChannel = 'paynow' | 'card'
export type DbsRecipientKind = 'business' | 'person' | 'unknown'

export type DbsEmailParse =
  | {
      ok: true
      amount: number
      merchant: string
      channel: DbsChannel
      recipientKind: DbsRecipientKind
      occurredAt?: string
    }
  | { ok: false; reason: 'no-amount' | 'invalid-amount' }

const MONTHS = new Map([
  ['jan', 0], ['feb', 1], ['mar', 2], ['apr', 3], ['may', 4], ['jun', 5],
  ['jul', 6], ['aug', 7], ['sep', 8], ['oct', 9], ['nov', 10], ['dec', 11],
])
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000

function recipientKind(rawMerchant: string): DbsRecipientKind {
  if (/\(\s*UEN\s+ending\b/i.test(rawMerchant)) return 'business'
  if (/\(\s*MOBILE\s+ending\b/i.test(rawMerchant)) return 'person'
  return 'unknown'
}

function merchantFrom(body: string): { merchant: string; recipientKind: DbsRecipientKind } {
  const lineMatch = /(?:^|\n)[ \t]*(?:To|At|Merchant)[ \t]*[:-][ \t]*(.+)/i.exec(body)
  const flattenedMatch = /\b(?:To|At|Merchant)[ \t]*[:-][ \t]*(.+?)(?=\s+(?:If\s+unauthorised|To\s+view|Date\s*&\s*Time|Amount|From|Reference|Transaction)\b|$)/i.exec(body)
  const inlineMatch = /\bPayNow\s+transfer\s+of\s+(?:SGD|S\$|\$)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s+to\s+(.+?)(?=\s+on\b|[.\n]|$)/i.exec(body)
  const rawMerchant = (lineMatch?.[1] ?? flattenedMatch?.[1] ?? inlineMatch?.[1] ?? '').trim()

  return {
    merchant: rawMerchant.replace(/\s*\([^)]*\)\s*$/, '').trim(),
    recipientKind: recipientKind(rawMerchant),
  }
}

function validSgtTimestamp(year: number, month: number, day: number, hour: number, minute: number): number | null {
  const timestamp = Date.UTC(year, month, day, hour - 8, minute)
  const singapore = new Date(timestamp + SGT_OFFSET_MS)
  if (
    singapore.getUTCFullYear() !== year
    || singapore.getUTCMonth() !== month
    || singapore.getUTCDate() !== day
    || singapore.getUTCHours() !== hour
    || singapore.getUTCMinutes() !== minute
  ) return null
  return timestamp
}

function transactionTime(body: string, receivedAt: string | Date | undefined): string | undefined {
  const match = /\bDate\s*&\s*Time\s*:\s*(\d{1,2})\s+([A-Za-z]{3})\s+(?:(\d{4})\s+)?(\d{1,2}):(\d{2})\b/i.exec(body)
  if (!match) return undefined

  const day = Number(match[1])
  const month = MONTHS.get(match[2].toLowerCase())
  const explicitYear = match[3] ? Number(match[3]) : undefined
  const hour = Number(match[4])
  const minute = Number(match[5])
  if (month === undefined || hour > 23 || minute > 59) return undefined

  const reference = receivedAt instanceof Date ? receivedAt : new Date(receivedAt ?? Date.now())
  if (Number.isNaN(reference.getTime())) return undefined
  const referenceSgtYear = new Date(reference.getTime() + SGT_OFFSET_MS).getUTCFullYear()
  const years = explicitYear === undefined
    ? [referenceSgtYear - 1, referenceSgtYear, referenceSgtYear + 1]
    : [explicitYear]
  const candidates = years
    .map(year => validSgtTimestamp(year, month, day, hour, minute))
    .filter((value): value is number => value !== null)
    .sort((a, b) => Math.abs(a - reference.getTime()) - Math.abs(b - reference.getTime()))

  return candidates[0] === undefined ? undefined : new Date(candidates[0]).toISOString()
}

export function parseDbsEmail(rawBody: string, receivedAt?: string | Date): DbsEmailParse {
  const body = rawBody.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')

  // Amount: "SGD5.70", "SGD 5.70", "S$5.70" or "$1,234.50" — space after the symbol is optional.
  const amountMatch = /(?:SGD|S\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(body)
  if (!amountMatch) {
    return { ok: false, reason: 'no-amount' }
  }
  const amount = Number(amountMatch[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }

  const merchant = merchantFrom(body)

  // DBS sends one email shape for card swipes and another for PayNow transfers;
  // the PayNow body says so explicitly. Used to label the entry's note.
  const channel: DbsChannel = /paynow/i.test(body) ? 'paynow' : 'card'

  return {
    ok: true,
    amount,
    merchant: merchant.merchant,
    channel,
    recipientKind: merchant.recipientKind,
    occurredAt: transactionTime(body, receivedAt),
  }
}

export type DbsEmailParse =
  | { ok: true; amount: number; merchant: string }
  | { ok: false; reason: 'no-amount' | 'invalid-amount' }

export function parseDbsEmail(rawBody: string): DbsEmailParse {
  const body = rawBody.replace(/\r\n/g, '\n')

  // Amount: "SGD5.70", "SGD 5.70", "S$5.70" or "$1,234.50" — space after the symbol is optional.
  const amountMatch = /(?:SGD|S\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(body)
  if (!amountMatch) {
    return { ok: false, reason: 'no-amount' }
  }
  const amount = Number(amountMatch[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }

  // Merchant: the recipient/merchant on a "To:" line (PayNow & card alerts both use it),
  // falling back to "At"/"Merchant". Use [ \t] so the line is matched, not spanned across
  // newlines, and ignore the "From:" line. Strip a trailing "(UEN ending ...)" parenthetical.
  const merchantMatch = /(?:^|\n)[ \t]*(?:To|At|Merchant)[ \t]*[:\-][ \t]*(.+)/i.exec(body)
  const merchant = (merchantMatch ? merchantMatch[1] : '')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
  return { ok: true, amount, merchant }
}

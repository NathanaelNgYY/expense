export type DbsEmailParse =
  | { ok: true; amount: number; merchant: string }
  | { ok: false; reason: 'no-amount' | 'invalid-amount' }

export function parseDbsEmail(rawBody: string): DbsEmailParse {
  const amountMatch = /(?:SGD|S\$|\$)\s*([0-9][0-9,]*\.?[0-9]{0,2})/i.exec(rawBody)
  if (!amountMatch) {
    return { ok: false, reason: 'no-amount' }
  }
  const amount = Number(amountMatch[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid-amount' }
  }

  // Merchant: prefer a "To: <name>" or "at <name>" line; otherwise empty.
  const merchantMatch = /(?:^|\n)\s*(?:To|At|Merchant)\s*[:\-]\s*(.+)/i.exec(rawBody)
  const merchant = merchantMatch ? merchantMatch[1].trim() : ''
  return { ok: true, amount, merchant }
}

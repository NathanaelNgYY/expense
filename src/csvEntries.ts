import { CATEGORIES } from './types'
import type { Category, Entry, EntryKind } from './types'
import { normalizeCurrencyCode } from './shared/currency'

interface MergeResult {
  entries: Entry[]
  importedCount: number
  duplicateCount: number
}

const LEGACY_ENTRY_HEADERS = ['id', 'amount', 'category', 'note', 'date']
const KIND_ENTRY_HEADERS = [...LEGACY_ENTRY_HEADERS, 'kind']
const ENTRY_HEADERS = [...KIND_ENTRY_HEADERS, 'currency']
const CATEGORY_SET = new Set<Category>(CATEGORIES)

function csvCell(value: string | number | null): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function spreadsheetSafeCsvCell(value: string): string {
  return csvCell(/^[=+\-@]/.test(value) ? `'${value}` : value)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (inQuotes) {
    throw new Error('CSV has an unterminated quoted cell')
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter(csvRow => csvRow.some(value => value.trim() !== ''))
}

function isCategory(value: string): value is Category {
  return CATEGORY_SET.has(value as Category)
}

function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(year, month - 1, day)

  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  )
}

function parseEntry(row: string[], rowNumber: number, hasKind: boolean, hasCurrency: boolean): Entry {
  const expectedCells = hasCurrency ? ENTRY_HEADERS.length : hasKind ? KIND_ENTRY_HEADERS.length : LEGACY_ENTRY_HEADERS.length
  if (row.length !== expectedCells) {
    throw new Error(`Row ${rowNumber} has ${row.length} cells instead of ${expectedCells}`)
  }

  const [rawId, rawAmountText, rawCategoryText, note, rawDate, rawKind, rawCurrency] = row
  const id = rawId.trim()
  const amountText = rawAmountText.trim()
  const categoryText = rawCategoryText.trim()
  const date = rawDate.trim()
  const amount = Number(amountText)
  const kind = (rawKind?.trim() || 'expense') as EntryKind

  if (!id) {
    throw new Error(`Row ${rowNumber} is missing an id`)
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Row ${rowNumber} has an invalid amount`)
  }

  let category: Category | null = null

  if (categoryText) {
    if (!isCategory(categoryText)) {
      throw new Error(`Row ${rowNumber} has an invalid category`)
    }

    category = categoryText
  }

  if (!isValidDateString(date)) {
    throw new Error(`Row ${rowNumber} has an invalid date`)
  }

  if (kind !== 'expense' && kind !== 'refund') {
    throw new Error(`Row ${rowNumber} has an invalid kind`)
  }

  const entry: Entry = {
    id,
    amount,
    kind,
    category,
    note,
    date,
  }
  const currency = normalizeCurrencyCode(rawCurrency)
  if (currency) entry.currency = currency
  return entry
}

export function entriesToCsv(entries: Entry[]): string {
  return [
    ENTRY_HEADERS.map(csvCell).join(','),
    ...entries.map(entry =>
      [csvCell(entry.id), csvCell(entry.amount), csvCell(entry.category), spreadsheetSafeCsvCell(entry.note), csvCell(entry.date), csvCell(entry.kind ?? 'expense'), csvCell(normalizeCurrencyCode(entry.currency) ?? '')].join(','),
    ),
  ].join('\n')
}

export function parseEntriesCsv(text: string): Entry[] {
  const rows = parseCsv(text)
  const header = rows[0]

  const normalizedHeader = header?.map(value => value.trim()).join(',')
  const hasCurrency = normalizedHeader === ENTRY_HEADERS.join(',')
  const hasKind = hasCurrency || normalizedHeader === KIND_ENTRY_HEADERS.join(',')
  const isLegacy = normalizedHeader === LEGACY_ENTRY_HEADERS.join(',')
  if (!header || (!hasKind && !isLegacy)) {
    throw new Error('CSV must use the exported budget entries format')
  }

  return rows.slice(1).map((row, index) => parseEntry(row, index + 2, hasKind, hasCurrency))
}

export function mergeImportedEntries(existingEntries: Entry[], importedEntries: Entry[]): MergeResult {
  const seenIds = new Set(existingEntries.map(entry => entry.id))
  const newEntries = importedEntries.filter(entry => {
    if (seenIds.has(entry.id)) return false
    seenIds.add(entry.id)
    return true
  })

  return {
    entries: [...existingEntries, ...newEntries],
    importedCount: newEntries.length,
    duplicateCount: importedEntries.length - newEntries.length,
  }
}

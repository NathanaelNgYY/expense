import { CATEGORIES } from './types'
import type { Category, Entry } from './types'

interface MergeResult {
  entries: Entry[]
  importedCount: number
  duplicateCount: number
}

const ENTRY_HEADERS = ['id', 'amount', 'category', 'note', 'date']
const CATEGORY_SET = new Set<Category>(CATEGORIES)

function csvCell(value: string | number | null): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
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

function parseEntry(row: string[], rowNumber: number): Entry {
  if (row.length !== ENTRY_HEADERS.length) {
    throw new Error(`Row ${rowNumber} has ${row.length} cells instead of ${ENTRY_HEADERS.length}`)
  }

  const [rawId, rawAmountText, rawCategoryText, note, rawDate] = row
  const id = rawId.trim()
  const amountText = rawAmountText.trim()
  const categoryText = rawCategoryText.trim()
  const date = rawDate.trim()
  const amount = Number(amountText)

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

  return {
    id,
    amount,
    category,
    note,
    date,
  }
}

export function entriesToCsv(entries: Entry[]): string {
  return [
    ENTRY_HEADERS.map(csvCell).join(','),
    ...entries.map(entry =>
      [entry.id, entry.amount, entry.category, entry.note, entry.date].map(csvCell).join(','),
    ),
  ].join('\n')
}

export function parseEntriesCsv(text: string): Entry[] {
  const rows = parseCsv(text)
  const header = rows[0]

  if (!header || header.map(value => value.trim()).join(',') !== ENTRY_HEADERS.join(',')) {
    throw new Error('CSV must use the exported budget entries format')
  }

  return rows.slice(1).map((row, index) => parseEntry(row, index + 2))
}

export function mergeImportedEntries(existingEntries: Entry[], importedEntries: Entry[]): MergeResult {
  const existingIds = new Set(existingEntries.map(entry => entry.id))
  const newEntries = importedEntries.filter(entry => !existingIds.has(entry.id))

  return {
    entries: [...existingEntries, ...newEntries],
    importedCount: newEntries.length,
    duplicateCount: importedEntries.length - newEntries.length,
  }
}

import type { Entry } from '../../types'

export function sourceLabel(entry: Entry): string {
  switch (entry.source) {
    case 'apple-pay':
      return 'Apple Pay'
    case 'dbs-email':
      return 'DBS email'
    default:
      return 'Manual'
  }
}

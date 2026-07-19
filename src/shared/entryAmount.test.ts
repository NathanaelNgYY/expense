import { describe, expect, it } from 'vitest'
import { entryKind, entryNetAmount, isRefund } from './entryAmount'
import type { Entry } from '../types'

const expense: Entry = {
  id: 'expense-1',
  amount: 20,
  category: 'lunch',
  note: '',
  date: '2026-07-19',
}

describe('entry amount semantics', () => {
  it('treats legacy entries without a kind as expenses', () => {
    expect(entryKind(expense)).toBe('expense')
    expect(entryNetAmount(expense)).toBe(20)
    expect(isRefund(expense)).toBe(false)
  })

  it('turns a positive stored refund amount into a negative spend effect', () => {
    const refund: Entry = { ...expense, id: 'refund-1', amount: 7.5, kind: 'refund' }

    expect(entryKind(refund)).toBe('refund')
    expect(entryNetAmount(refund)).toBe(-7.5)
    expect(isRefund(refund)).toBe(true)
  })
})

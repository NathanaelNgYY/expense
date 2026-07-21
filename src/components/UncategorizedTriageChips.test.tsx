import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UncategorizedTriageChips from './UncategorizedTriageChips'
import type { Entry } from '../types'

const options = [
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'transport', label: 'Transport', icon: 'transport' },
  { id: 'others', label: 'Others', icon: 'others' },
  { id: 'savings', label: 'Savings', icon: 'savings' },
]
const entry: Entry = { id: 'e1', amount: 5.8, category: null, note: '', date: '2026-07-15', merchant: 'Toast Box' }

describe('UncategorizedTriageChips', () => {
  it('renders the ranked chips plus an overflow control, and hides non-ranked categories', () => {
    render(<UncategorizedTriageChips entry={entry} rankedIds={['lunch', 'transport', 'others']} categoryOptions={options} onCategorize={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Categorize Toast Box as Lunch' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Categorize Toast Box as Transport' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show all categories' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Categorize Toast Box as Savings' })).toBeNull()
  })

  it('calls onCategorize with the entry and chosen id when a chip is tapped', () => {
    const onCategorize = vi.fn()
    render(<UncategorizedTriageChips entry={entry} rankedIds={['lunch', 'transport', 'others']} categoryOptions={options} onCategorize={onCategorize} />)
    fireEvent.click(screen.getByRole('button', { name: 'Categorize Toast Box as Lunch' }))
    expect(onCategorize).toHaveBeenCalledWith(entry, 'lunch')
  })

  it('expands to every category and collapses again', () => {
    render(<UncategorizedTriageChips entry={entry} rankedIds={['lunch', 'transport', 'others']} categoryOptions={options} onCategorize={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all categories' }))
    expect(screen.getByRole('button', { name: 'Categorize Toast Box as Savings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse category list' }))
    expect(screen.queryByRole('button', { name: 'Categorize Toast Box as Savings' })).toBeNull()
  })

  it('names an entry with no merchant generically', () => {
    render(<UncategorizedTriageChips entry={{ ...entry, merchant: undefined }} rankedIds={['lunch']} categoryOptions={options} onCategorize={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Categorize entry as Lunch' })).toBeTruthy()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Entry } from '../types'
import UncategorizedReviewDialog from './UncategorizedReviewDialog'

const entries: Entry[] = [
  {
    id: 'apple-1',
    amount: 8.5,
    category: null,
    note: 'Apple Pay · Mystery Noodles',
    date: '2026-07-19',
    source: 'apple-pay',
    merchant: 'Mystery Noodles Pte Ltd',
  },
  {
    id: 'dbs-1',
    amount: 4.2,
    category: null,
    note: 'PayNow · Unknown Kopi',
    date: '2026-07-18',
    source: 'dbs-email',
    merchant: 'Unknown Kopi',
  },
]

const options = [
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'cat_dinner', label: 'Dinner', icon: 'utensils' },
]

describe('UncategorizedReviewDialog', () => {
  it('opens on entry, explains merchant learning, and categorizes the captured payment', () => {
    const onCategorize = vi.fn()
    render(
      <UncategorizedReviewDialog
        entries={entries}
        categoryOptions={options}
        onCategorize={onCategorize}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Payment needs a category' })).toBeInTheDocument()
    expect(screen.getByText('Mystery Noodles Pte Ltd')).toBeInTheDocument()
    expect(screen.getByText(/future payments from this merchant/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }))
    expect(onCategorize).toHaveBeenCalledWith(entries[0], 'cat_dinner')
  })

  it('can be dismissed for the current app visit', () => {
    render(
      <UncategorizedReviewDialog
        entries={entries}
        categoryOptions={options}
        onCategorize={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Review later' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores deliberately uncategorized manual entries', () => {
    render(
      <UncategorizedReviewDialog
        entries={[{ ...entries[0], source: 'manual' }]}
        categoryOptions={options}
        onCategorize={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

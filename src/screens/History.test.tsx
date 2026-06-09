import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import History from './History'
import { getEntries } from '../storage'
import type { Entry } from '../types'

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    amount: 10,
    category: 'lunch',
    note: 'Old note',
    date: '2026-05-19',
    ...overrides,
  }
}

function renderHistory(
  props: Partial<React.ComponentProps<typeof History>> = {},
): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<History {...props} />)
  })

  return { container, root }
}

function changeInput(input: HTMLInputElement, value: string): void {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      'value',
    )?.set

    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('History entry editing', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00'))
    localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
    vi.useRealTimers()
    localStorage.clear()
  })

  it('opens an entry editor after tapping a history entry and saves edits', () => {
    localStorage.setItem(
      'budget_entries',
      JSON.stringify([entry({ id: 'entry-1', source: 'apple-pay', importKey: 'apple-pay:key' })]),
    )

    const rendered = renderHistory()
    root = rendered.root

    const entryButton = [...rendered.container.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Old note'),
    )
    if (!entryButton) throw new Error('Entry button was not found')

    act(() => {
      entryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const editPanel = rendered.container.querySelector<HTMLElement>('[aria-label="Edit expense"]')
    if (!editPanel) throw new Error('Edit panel was not found')

    const amountInput = editPanel.querySelector<HTMLInputElement>('#edit-entry-amount')
    const noteInput = editPanel.querySelector<HTMLInputElement>('#edit-entry-note')
    const dateInput = editPanel.querySelector<HTMLInputElement>('#edit-entry-date')
    if (!amountInput || !noteInput || !dateInput) throw new Error('Edit inputs were not found')

    changeInput(amountInput, '12.40')
    changeInput(noteInput, 'FairPrice edited')
    changeInput(dateInput, '2026-05-18')

    const othersChip = [...editPanel.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Others'),
    )
    if (!othersChip) throw new Error('Others chip was not found')

    act(() => {
      othersChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saveButton = [...editPanel.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Save Changes'),
    )
    if (!saveButton) throw new Error('Save Changes button was not found')

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getEntries()[0]).toMatchObject({
      id: 'entry-1',
      amount: 12.4,
      category: 'others',
      note: 'FairPrice edited',
      date: '2026-05-18',
      source: 'apple-pay',
      importKey: 'apple-pay:key',
    })
    expect(rendered.container).toHaveTextContent('Updated S$12.40')
  })

  it('opens the requested imported entry when initialEditingEntryId is passed', () => {
    const onEditHandled = vi.fn()
    localStorage.setItem(
      'budget_entries',
      JSON.stringify([
        entry({
          id: 'apple-pay-entry',
          amount: 12.5,
          category: 'others',
          note: 'FairPrice',
          source: 'apple-pay',
          importKey: 'apple-pay:key',
        }),
      ]),
    )

    const rendered = renderHistory({
      initialEditingEntryId: 'apple-pay-entry',
      onEditHandled,
    })
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Edit Expense')
    expect(rendered.container).toHaveTextContent('FairPrice')
    expect(onEditHandled).toHaveBeenCalled()
  })
})

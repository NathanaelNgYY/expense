import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import History from './History'
import { EntriesProvider } from '../EntriesContext'
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

function renderWithEntries(
  entries: unknown[] = [],
  props: Partial<React.ComponentProps<typeof History>> = {},
): { container: HTMLDivElement; root: Root } {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  // A realistic server: mutations are reflected in subsequent GETs (the real backend persists
  // them), so the background refresh after a mutation doesn't clobber the optimistic update.
  const server = [...(entries as Entry[])]
  vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
    const method = opts?.method ?? 'GET'
    const id = url.split('/').pop() ?? ''
    if (method === 'POST') {
      const created = JSON.parse(opts!.body as string) as Entry
      server.push(created)
      return Promise.resolve(new Response(JSON.stringify(created), { status: 201 }))
    }
    if (method === 'PUT') {
      const idx = server.findIndex(e => e.id === id)
      if (idx >= 0) server[idx] = { ...server[idx], ...(JSON.parse(opts!.body as string) as Partial<Entry>) }
      return Promise.resolve(new Response(JSON.stringify(server[idx] ?? {}), { status: 200 }))
    }
    if (method === 'DELETE') {
      const idx = server.findIndex(e => e.id === id)
      if (idx >= 0) server.splice(idx, 1)
      return Promise.resolve(new Response(JSON.stringify({ status: 'deleted' }), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify(server), { status: 200 }))
  }))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EntriesProvider>
        <History {...props} />
      </EntriesProvider>,
    )
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

function changeSelect(select: HTMLSelectElement, value: string): void {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(select),
      'value',
    )?.set

    valueSetter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, label: string): void {
  const button = [...container.querySelectorAll('button')].find(candidate =>
    candidate.textContent?.includes(label) || candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`${label} button was not found`)

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('opens an entry editor after tapping a history entry and saves edits', async () => {
    const testEntry = entry({ id: 'entry-1', source: 'apple-pay', importKey: 'apple-pay:key' })
    const rendered = renderWithEntries([testEntry])
    root = rendered.root

    // Let the initial mount-time refresh settle before editing, mirroring a real session where
    // the data has loaded before the user interacts (otherwise its in-flight GET races the edit).
    await act(async () => {})

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

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Context writes to cache; the cache should reflect the edit
    expect(getEntries()[0]).toMatchObject({
      id: 'entry-1',
      amount: 12.4,
      category: 'others',
      note: 'FairPrice edited',
      date: '2026-05-18',
    })
    expect(rendered.container).toHaveTextContent('Updated S$12.40')
  })

  it('opens the requested imported entry when initialEditingEntryId is passed', () => {
    const onEditHandled = vi.fn()
    const testEntry = entry({
      id: 'apple-pay-entry',
      amount: 12.5,
      category: 'others',
      note: 'FairPrice',
      source: 'apple-pay',
      importKey: 'apple-pay:key',
    })

    const rendered = renderWithEntries([testEntry], {
      initialEditingEntryId: 'apple-pay-entry',
      onEditHandled,
    })
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Transaction details')
    expect(rendered.container).toHaveTextContent('FairPrice')
    expect(onEditHandled).toHaveBeenCalled()
  })

  it('searches notes and merchants, then filters by category, source, and date', async () => {
    const rendered = renderWithEntries([
      entry({ id: 'lunch', amount: 8.5, note: 'Campus lunch', date: '2026-05-19', source: 'manual' }),
      entry({
        id: 'train',
        amount: 2.2,
        category: 'transport',
        note: 'Morning commute',
        merchant: 'SMRT',
        date: '2026-05-18',
        source: 'apple-pay',
      }),
      entry({
        id: 'groceries',
        amount: 24.6,
        category: null,
        note: 'Weekly groceries',
        merchant: 'NTUC FairPrice',
        date: '2026-05-17',
        source: 'dbs-email',
      }),
    ])
    root = rendered.root
    await act(async () => {})

    const search = rendered.container.querySelector<HTMLInputElement>('[aria-label="Search transactions"]')
    if (!search) throw new Error('Search input was not found')
    changeInput(search, 'fairprice')

    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(1)
    expect(rendered.container.querySelector('.entry-list')).toHaveTextContent('S$24.60')
    expect(rendered.container).toHaveTextContent('1 of 3 transactions')

    changeInput(search, '')
    clickButton(rendered.container, 'Show transaction filters')

    const source = rendered.container.querySelector<HTMLSelectElement>('#history-source-filter')
    const category = rendered.container.querySelector<HTMLSelectElement>('#history-category-filter')
    const from = rendered.container.querySelector<HTMLInputElement>('#history-date-from')
    const to = rendered.container.querySelector<HTMLInputElement>('#history-date-to')
    if (!source || !category || !from || !to) throw new Error('Filter controls were not found')

    changeSelect(source, 'apple-pay')
    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(1)
    expect(rendered.container.querySelector('.entry-list')).toHaveTextContent('SMRT')

    changeSelect(source, 'all')
    changeSelect(category, 'uncategorized')
    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(1)
    expect(rendered.container.querySelector('.entry-list')).toHaveTextContent('Weekly groceries')

    changeSelect(category, 'all')
    changeInput(from, '2026-05-18')
    changeInput(to, '2026-05-19')
    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(2)

    clickButton(rendered.container, 'Clear filters')
    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(3)
  })

  it('duplicates, deletes, and restores an imported transaction with undo', async () => {
    const imported = entry({
      id: 'apple-pay-entry',
      amount: 12.5,
      category: 'others',
      note: 'Groceries',
      merchant: 'FairPrice',
      source: 'apple-pay',
      occurredAt: '2026-05-19T04:00:00.000Z',
      currency: 'SGD',
      dedupeKey: 'apple_pay:original',
    })
    const rendered = renderWithEntries([imported])
    root = rendered.root
    await act(async () => {})

    clickButton(rendered.container, 'Apple Pay')
    const detail = rendered.container.querySelector<HTMLElement>('[aria-label="Transaction details"]')
    if (!detail) throw new Error('Transaction detail was not found')
    expect(detail).toHaveTextContent('FairPrice')
    expect(detail).toHaveTextContent('Apple Pay')

    clickButton(detail, 'Duplicate')
    await act(async () => {})

    const afterDuplicate = getEntries()
    expect(afterDuplicate).toHaveLength(2)
    expect(afterDuplicate.find(candidate => candidate.id !== imported.id)).toMatchObject({
      amount: 12.5,
      category: 'others',
      note: 'Groceries',
      date: '2026-05-19',
      source: 'manual',
    })

    clickButton(rendered.container, 'Apple Pay')
    const reopenedDetail = rendered.container.querySelector<HTMLElement>('[aria-label="Transaction details"]')
    if (!reopenedDetail) throw new Error('Reopened transaction detail was not found')
    clickButton(reopenedDetail, 'Delete')
    clickButton(reopenedDetail, 'Delete transaction')
    await act(async () => {})

    expect(getEntries().some(candidate => candidate.id === imported.id)).toBe(false)
    expect(rendered.container).toHaveTextContent('Transaction deleted')

    clickButton(rendered.container, 'Undo')
    await act(async () => {})

    expect(getEntries().find(candidate => candidate.id === imported.id)).toMatchObject({
      id: imported.id,
      source: 'apple-pay',
      merchant: 'FairPrice',
      occurredAt: imported.occurredAt,
      currency: 'SGD',
      dedupeKey: 'apple_pay:original',
    })
  })

  it('filters the ledger to a tapped calendar day and offers dated entry', async () => {
    const onAddForDate = vi.fn()
    const rendered = renderWithEntries([
      entry({ id: 'lunch', amount: 6.3, note: 'Food court', date: '2026-05-18' }),
      entry({ id: 'train', amount: 8.5, category: 'transport', note: '', date: '2026-05-18' }),
      entry({ id: 'other-day', amount: 20, category: 'others', date: '2026-05-17' }),
    ], { onAddForDate })
    root = rendered.root
    await act(async () => {})

    clickButton(rendered.container, 'May 18, S$14.80 spent')

    expect(rendered.container.querySelector('[role="dialog"]')).not.toBeInTheDocument()
    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(2)
    expect(rendered.container.querySelector('.entry-list')).toHaveTextContent('Food court')
    expect(rendered.container.querySelector('.entry-list')).not.toHaveTextContent('S$20.00')
    expect(rendered.container).toHaveTextContent('2 of 3 transactions')

    clickButton(rendered.container, 'Add for May 18')
    expect(onAddForDate).toHaveBeenCalledWith('2026-05-18')

    clickButton(rendered.container, 'Clear day filter')
    expect(rendered.container.querySelectorAll('.entry-row-button')).toHaveLength(3)
    expect(rendered.container).not.toHaveTextContent('Add missed expense')
    expect(rendered.container).toHaveTextContent('Calendar & insights')
  })

  it('scopes boundary weeks to the selected month and exposes an accessible spending summary', async () => {
    const rendered = renderWithEntries([
      entry({ id: 'april-lunch', amount: 100, date: '2026-04-30' }),
      entry({ id: 'may-lunch', amount: 10, date: '2026-05-01' }),
    ])
    root = rendered.root
    await act(async () => {})

    const firstWeek = rendered.container.querySelector<HTMLElement>('.week-bar')
    if (!firstWeek) throw new Error('First weekly spending card was not found')

    expect(firstWeek).toHaveTextContent('S$10.00')
    expect(firstWeek).not.toHaveTextContent('S$110.00')
    expect(firstWeek).toHaveAccessibleDescription(
      'Total S$10.00 of S$116.13 target. Lunch S$10.00 of S$25.55 target.',
    )
  })
})

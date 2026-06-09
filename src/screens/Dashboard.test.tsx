import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Dashboard from './Dashboard'
import { EntriesProvider } from '../EntriesContext'
import type { Entry } from '../types'

let nextId = 0

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: `entry-${nextId++}`,
    amount: 10,
    category: 'lunch',
    note: '',
    date: '2026-05-04',
    ...overrides,
  }
}

function renderWithEntries(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(entries), { status: 200 })))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EntriesProvider>
        <Dashboard onSettings={() => undefined} />
      </EntriesProvider>,
    )
  })

  return { container, root }
}

function clickCategory(container: HTMLElement, label: string): void {
  const button = [...container.querySelectorAll('button, [role="button"]')].find(element =>
    element.textContent?.includes(label),
  )

  if (!button) throw new Error(`Category button ${label} was not found`)

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('Dashboard category expense history', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T12:00:00'))
    localStorage.clear()
    nextId = 0
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

  it('shows current-month expenses after clicking a category', () => {
    const rendered = renderWithEntries([
      entry({ amount: 12.5, category: 'lunch', date: '2026-05-04' }),
      entry({ amount: 8, category: 'lunch', date: '2026-04-30' }),
      entry({ amount: 4, category: 'transport', date: '2026-05-05' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')

    const list = rendered.container.querySelector('#category-expenses-lunch')
    expect(list).toHaveTextContent('Lunch Expenses')
    expect(list).toHaveTextContent('Mon, May 4')
    expect(list).toHaveTextContent('S$12.50')
    expect(list).not.toHaveTextContent('Thu, Apr 30')
    expect(list).not.toHaveTextContent('S$4.00')
  })

  it('shows notes for others expenses', () => {
    const rendered = renderWithEntries([
      entry({
        amount: 100,
        category: 'others',
        note: 'clothes',
        date: '2026-05-06',
      }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Others')

    const list = rendered.container.querySelector('#category-expenses-others')
    expect(list).toHaveTextContent('Others Expenses')
    expect(list).toHaveTextContent('clothes')
    expect(list).toHaveTextContent('S$100.00')
  })

  it('limits category dropdown expenses to the past two weeks', () => {
    vi.setSystemTime(new Date('2026-05-25T12:00:00'))
    const rendered = renderWithEntries([
      entry({ amount: 7, category: 'lunch', date: '2026-05-10' }),
      entry({ amount: 9, category: 'lunch', date: '2026-05-11' }),
      entry({ amount: 14, category: 'lunch', date: '2026-05-24' }),
    ])
    root = rendered.root

    clickCategory(rendered.container, 'Lunch')

    const list = rendered.container.querySelector('#category-expenses-lunch')
    expect(list).toHaveTextContent('Mon, May 11')
    expect(list).toHaveTextContent('Sun, May 24')
    expect(list).not.toHaveTextContent('Sun, May 10')
    expect(list).not.toHaveTextContent('S$7.00')
  })

  it('uses the configured monthly income in the summary', () => {
    localStorage.setItem(
      'budget_config',
      JSON.stringify({
        lunch: 264,
        transport: 50,
        savings: 400,
        investments: 250,
        buffer: 236,
        monthlyIncome: 1800,
      }),
    )

    const rendered = renderWithEntries([])
    root = rendered.root

    expect(rendered.container).toHaveTextContent('S$1,800 / month')
    expect(rendered.container).toHaveTextContent('Monthly income')
    expect(rendered.container).toHaveTextContent('S$1,800')
  })
})

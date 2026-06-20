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

    expect(rendered.container).toHaveTextContent('Edit Expense')
    expect(rendered.container).toHaveTextContent('FairPrice')
    expect(onEditHandled).toHaveBeenCalled()
  })
})

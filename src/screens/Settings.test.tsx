import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Settings from './Settings'
import { EntriesProvider } from '../EntriesContext'

function renderWithEntries(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  // Default stub: returns the seeded entries for fetchEntries (GET /api/entries)
  // and echoes back a created entry for POST (createEntryApi)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        try {
          const body = JSON.parse(init.body as string) as Record<string, unknown>
          return Promise.resolve(
            new Response(JSON.stringify({ id: crypto.randomUUID(), ...body, source: 'manual' }), { status: 200 }),
          )
        } catch {
          return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
        }
      }
      return Promise.resolve(new Response(JSON.stringify(entries), { status: 200 }))
    }),
  )
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <EntriesProvider>
        <Settings onBack={() => undefined} />
      </EntriesProvider>,
    )
  })

  return { container, root }
}

function changeInput(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickSave(container: HTMLElement): void {
  const button = [...container.querySelectorAll('button')].find(element =>
    element.textContent?.includes('Save Budgets'),
  )

  if (!button) throw new Error('Save Budgets button was not found')

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function importCsv(container: HTMLElement, csv: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')

  if (!input) throw new Error('Import CSV input was not found')

  const file = new File([csv], 'budget-entries.csv', { type: 'text/csv' })

  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  })

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Settings monthly income', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('saves an edited monthly income', () => {
    const rendered = renderWithEntries()
    root = rendered.root

    const input = rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')
    expect(input).not.toBeNull()

    changeInput(input!, '1800')
    clickSave(rendered.container)

    expect(JSON.parse(localStorage.getItem('budget_config') ?? '{}')).toMatchObject({
      monthlyIncome: 1800,
    })
  })

  it('imports CSV entries, deduplicates, and reports the count', async () => {
    const existingEntry = {
      id: 'entry-1',
      amount: 3.5,
      category: 'transport',
      note: 'Train',
      date: '2026-05-10',
    }
    const rendered = renderWithEntries([existingEntry])
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Import CSV')

    await importCsv(
      rendered.container,
      [
        '"id","amount","category","note","date"',
        '"entry-1","3.5","transport","Train","2026-05-10"',
        '"entry-2","12.5","lunch","Chicken rice","2026-05-11"',
      ].join('\n'),
    )

    // The import deduplicates entry-1 (already exists) and adds entry-2.
    // Because onBack() is called after import, the settings screen navigates
    // away before showing a message. Verify that no error is displayed.
    // (The onBack prop is a no-op in this test so the screen stays mounted.)
    // The status message "Imported 1 entry." should be rendered.
    // Note: onBack is a no-op here so the component stays mounted long enough
    // to assert the message before unmount.
    expect(rendered.container).toHaveTextContent('Imported 1 entr')
  })
})

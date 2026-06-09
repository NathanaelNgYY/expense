import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import { getEntries } from './storage'

function renderApp(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<App />)
  })

  return { container, root }
}

describe('App Apple Pay import startup', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'apple-pay-entry') })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
    localStorage.clear()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('auto-saves a valid Apple Pay URL and clears the query string', () => {
    window.history.replaceState(
      {},
      '',
      '/?auto=applepay&amount=12.50&merchant=FairPrice%20Finest',
    )

    const rendered = renderApp()
    root = rendered.root

    expect(getEntries()).toEqual([
      {
        id: 'apple-pay-entry',
        amount: 12.5,
        category: 'others',
        note: 'FairPrice Finest',
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        source: 'apple-pay',
        importKey: expect.stringContaining('apple-pay:'),
      },
    ])
    expect(window.location.search).toBe('')
    expect(rendered.container).toHaveTextContent('Saved from Apple Pay')
    expect(rendered.container).toHaveTextContent('FairPrice Finest')
  })

  it('does not duplicate an already imported transaction', () => {
    localStorage.setItem(
      'budget_entries',
      JSON.stringify([
        {
          id: 'existing-entry',
          amount: 12.5,
          category: 'others',
          note: 'FairPrice Finest',
          date: '2026-05-19',
          source: 'apple-pay',
          importKey: 'apple-pay:2026-05-19:12.50:fairprice-finest',
        },
      ]),
    )
    window.history.replaceState(
      {},
      '',
      '/?auto=applepay&amount=12.50&merchant=FairPrice%20Finest&date=2026-05-19',
    )

    const rendered = renderApp()
    root = rendered.root

    expect(getEntries()).toHaveLength(1)
    expect(rendered.container).toHaveTextContent('Already saved')
  })

  it('shows an error banner for invalid Apple Pay URLs', () => {
    window.history.replaceState({}, '', '/?auto=applepay&amount=0&merchant=FairPrice')

    const rendered = renderApp()
    root = rendered.root

    expect(getEntries()).toEqual([])
    expect(rendered.container).toHaveTextContent('Could not save Apple Pay transaction')
  })

  it('keeps the existing manual add deep link working', () => {
    window.history.replaceState({}, '', '/?add=true')

    const rendered = renderApp()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('ADD ENTRY')
  })
})

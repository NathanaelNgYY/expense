import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntriesProvider } from '../EntriesContext'
import Insights from './Insights'

describe('Insights', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })))
  })

  afterEach(() => {
    act(() => root?.unmount())
    document.body.replaceChildren()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('owns the monthly category, weekly and pattern analysis', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <EntriesProvider>
          <Insights />
        </EntriesProvider>,
      )
    })

    expect(container.querySelector('h1')).toHaveTextContent('Insights')
    expect(container).toHaveTextContent('Category Breakdown')
    expect(container).toHaveTextContent('Weekly Spending')
    expect(container).toHaveTextContent('Month Review')
  })
})

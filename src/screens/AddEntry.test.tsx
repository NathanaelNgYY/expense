import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { render, screen } from '@testing-library/react'
import AddEntry from './AddEntry'
import { EntriesProvider } from '../EntriesContext'

function renderWithEntries(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(entries), { status: 200 })))
  return render(
    <EntriesProvider>
      <AddEntry onSave={() => undefined} />
    </EntriesProvider>,
  )
}

describe('AddEntry', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders the ADD ENTRY title', async () => {
    await act(async () => {
      renderWithEntries()
    })
    expect(screen.getByText('ADD ENTRY')).toBeInTheDocument()
  })

  it('save button is disabled when amount is zero', async () => {
    await act(async () => {
      renderWithEntries()
    })
    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).toBeDisabled()
  })

  it('save button becomes enabled after entering an amount', async () => {
    await act(async () => {
      renderWithEntries()
    })

    const key5 = screen.getByRole('button', { name: '5' })
    act(() => {
      key5.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).not.toBeDisabled()
  })

  it('navigates away immediately without waiting for the network POST', async () => {
    localStorage.setItem('api_token', 'tok')
    // GET on mount resolves; POST hangs forever to simulate a slow serverless round-trip.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>(() => {}) // never resolves
        : Promise.resolve(new Response('[]', { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const onSave = vi.fn()
    await act(async () => {
      render(
        <EntriesProvider>
          <AddEntry onSave={onSave} />
        </EntriesProvider>,
      )
    })

    act(() => {
      screen.getByRole('button', { name: '5' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      screen.getByRole('button', { name: /save/i }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The optimistic save is durable locally; the UI must not block on the hung POST.
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('renders a chip for each custom category', async () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    await act(async () => {
      renderWithEntries()
    })
    expect(screen.getByRole('button', { name: /gym/i })).toBeInTheDocument()
  })

  it('lets you select a custom category chip', async () => {
    localStorage.setItem(
      'budget_custom_categories',
      JSON.stringify([{ id: 'cat_gym_1', label: 'Gym', budget: null, icon: 'Dumbbell' }]),
    )
    await act(async () => {
      renderWithEntries()
    })
    const chip = screen.getByRole('button', { name: /gym/i })
    act(() => {
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(chip.className).toContain('chip--selected')
  })
})

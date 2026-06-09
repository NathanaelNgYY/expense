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
})

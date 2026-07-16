import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import AddEntry from './AddEntry'
import { EntriesProvider } from '../EntriesContext'
import { toLocalDateString } from '../dates'
import { getEntries } from '../storage'
import type { ActiveBudgetData, SharedBudget } from '../sharedBudgets/types'

const sharedCtx = vi.hoisted(() => ({
  value: {
    configured: true,
    authReady: true,
    session: { user: { id: 'u1' } },
    profile: { id: 'u1', displayName: 'Nat' },
    budgets: [] as SharedBudget[],
    active: null as ActiveBudgetData | null,
    error: null as string | null,
    refreshProfile: vi.fn(),
    createBudget: vi.fn(),
    joinBudget: vi.fn(),
    openBudget: vi.fn(),
    closeBudget: vi.fn(),
    addEntry: vi.fn(),
    editEntry: vi.fn(),
    removeEntry: vi.fn(),
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    removeCategory: vi.fn(),
    updateActiveBudget: vi.fn(),
    regenerateCode: vi.fn(),
    removeMember: vi.fn(),
    leaveActiveBudget: vi.fn(),
    deleteActiveBudget: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('../sharedBudgets/SharedBudgetsContext', () => ({
  useSharedBudgets: () => sharedCtx.value,
}))

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
    vi.clearAllMocks()
    sharedCtx.value.budgets = []
    sharedCtx.value.active = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows a labelled date control that defaults to today', async () => {
    await act(async () => {
      renderWithEntries()
    })

    const dateInput = screen.getByLabelText('Expense date')
    expect(dateInput).toHaveAttribute('type', 'date')
    expect(dateInput).toHaveValue(toLocalDateString())
    expect(dateInput).toHaveAttribute('max', toLocalDateString())
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('uses a date selected from History and exposes it in the date control', async () => {
    await act(async () => {
      localStorage.setItem('budget_entries', '[]')
      localStorage.setItem('api_token', 'tok')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
      render(
        <EntriesProvider>
          <AddEntry initialDate="2026-05-18" onSave={() => undefined} />
        </EntriesProvider>,
      )
    })

    expect(screen.getByLabelText('Expense date')).toHaveValue('2026-05-18')
    expect(screen.getByRole('button', { name: 'Add for May 18' })).toBeInTheDocument()
    act(() => {
      screen.getByRole('button', { name: '5' }).click()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Add for May 18' }).click()
    })

    expect(getEntries()).toEqual([
      expect.objectContaining({ amount: 5, date: '2026-05-18' }),
    ])
  })

  it('saves a past date selected directly on the Add screen', async () => {
    await act(async () => {
      renderWithEntries()
    })

    fireEvent.change(screen.getByLabelText('Expense date'), { target: { value: '2026-05-17' } })
    expect(screen.getByRole('button', { name: 'Add for May 17' })).toBeInTheDocument()

    act(() => {
      screen.getByRole('button', { name: '5' }).click()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Add for May 17' }).click()
    })

    expect(getEntries()).toEqual([
      expect.objectContaining({ amount: 5, date: '2026-05-17' }),
    ])
  })

  it('renders the Add entry page heading', async () => {
    await act(async () => {
      renderWithEntries()
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Add entry' })).toBeInTheDocument()
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

  it('accepts amount input from a physical keyboard', async () => {
    await act(async () => {
      renderWithEntries()
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
    })

    expect(screen.getByText('S$5.20')).toBeInTheDocument()
  })

  it('renders the amount as individually animated glyphs', async () => {
    await act(async () => {
      renderWithEntries()
    })

    act(() => {
      screen.getByRole('button', { name: '5' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const amountDisplay = screen.getByLabelText('Entered amount')
    const glyphs = Array.from(amountDisplay.querySelectorAll('.amount-glyph'))

    // M4: the visual display is not a live region (see the debounced-announcement tests below)
    // — a separate hidden role="status" span handles announcements instead.
    expect(amountDisplay).not.toHaveAttribute('aria-live')
    expect(amountDisplay).toHaveTextContent('S$5.00')
    expect(glyphs.map(glyph => glyph.textContent).join('')).toBe('S$5.00')
    expect(glyphs.every(glyph => glyph.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('animates only the newly entered digit when the amount grows', async () => {
    await act(async () => {
      renderWithEntries()
    })

    act(() => {
      screen.getByRole('button', { name: '5' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      screen.getByRole('button', { name: '6' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const amountDisplay = screen.getByLabelText('Entered amount')
    const glyphs = Array.from(amountDisplay.querySelectorAll('.amount-glyph'))
    const animatedGlyphs = glyphs.filter(glyph => glyph.classList.contains('amount-glyph--enter'))

    expect(glyphs.map(glyph => glyph.textContent).join('')).toBe('S$56.00')
    expect(animatedGlyphs.map(glyph => glyph.textContent)).toEqual(['6'])
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

  it('saves an entry to the selected shared budget from the normal Add tab', async () => {
    const budget: SharedBudget = {
      id: 'b1',
      name: 'Family',
      monthlyLimit: 300,
      currency: 'SGD',
      inviteCode: 'ABC123',
      ownerId: 'u1',
      createdAt: '2026-07-01T00:00:00Z',
    }
    sharedCtx.value.budgets = [budget]
    sharedCtx.value.active = {
      budget,
      categories: [{ id: 'c1', budgetId: 'b1', label: 'Groceries', budgetAmount: 120, icon: 'ShoppingBag' }],
      entries: [],
      members: [{ userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' }],
    }
    sharedCtx.value.addEntry.mockResolvedValue(undefined)
    const onSave = vi.fn()

    await act(async () => {
      render(
        <EntriesProvider>
          <AddEntry onSave={onSave} />
        </EntriesProvider>,
      )
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Family' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      screen.getByRole('button', { name: '5' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
      screen.getByRole('button', { name: /groceries/i }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      screen.getByRole('button', { name: /save/i }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(sharedCtx.value.addEntry).toHaveBeenCalledWith({
      amount: 5,
      categoryId: 'c1',
      note: '',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('does not mark the visual amount display as a live region', async () => {
    await act(async () => {
      renderWithEntries()
    })
    expect(screen.getByLabelText('Entered amount')).not.toHaveAttribute('aria-live')
  })

  it('announces the amount once after a typing pause, not per keypress', async () => {
    vi.useFakeTimers()
    try {
      await act(async () => {
        renderWithEntries()
      })
      const status = screen.getByRole('status')
      expect(status).toHaveTextContent('S$0.00')

      fireEvent.click(screen.getByRole('button', { name: '1' }))
      fireEvent.click(screen.getByRole('button', { name: '2' }))
      // Mid-typing: the live region must NOT have updated yet (visual shows S$12.00 already).
      expect(status).toHaveTextContent('S$0.00')

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      // Digits type dollars-first (getNextDigits): '1' then '2' → 12 → S$12.00.
      expect(status).toHaveTextContent('S$12.00')
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the debounce on rapid input so intermediate values are never announced', async () => {
    vi.useFakeTimers()
    try {
      await act(async () => {
        renderWithEntries()
      })
      const status = screen.getByRole('status')

      fireEvent.click(screen.getByRole('button', { name: '5' }))
      act(() => {
        vi.advanceTimersByTime(600) // less than the 1s window
      })
      fireEvent.click(screen.getByRole('button', { name: '5' }))
      act(() => {
        vi.advanceTimersByTime(600) // first timer would have fired by now if not reset
      })
      // Still the initial value: the second keypress reset the window.
      expect(status).toHaveTextContent('S$0.00')

      act(() => {
        vi.advanceTimersByTime(400) // completes the second 1s window
      })
      // '5' then '5' → digits '55' → S$55.00.
      expect(status).toHaveTextContent('S$55.00')
    } finally {
      vi.useRealTimers()
    }
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })))
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('App', () => {
  it('opens the compact first-run welcome on a fresh install', async () => {
    await act(async () => {
      render(<App />)
    })

    expect(await screen.findByRole('heading', { name: 'Make your monthly money plan yours.' })).toBeInTheDocument()
    expect(screen.getByText('Welcome — let’s start with your plan')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use defaults' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
  })

  it('saves the envelope budget and presents the ready receipt', async () => {
    await act(async () => {
      render(<App />)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Set up my budget' }))
    expect(screen.getByRole('heading', { name: 'Your pockets' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Total monthly plan'), { target: { value: '1400' } })
    fireEvent.change(screen.getByLabelText('Lunch target'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Transport target'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Savings target'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Investments target'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close my wallet' }))

    expect(screen.getByRole('heading', { name: 'S$1,400' })).toBeInTheDocument()
    expect(screen.getByText('Ready for this month')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('budget_config') ?? '{}')).toMatchObject({
      monthlyIncome: 1400,
      lunch: 300,
      transport: 100,
      savings: 500,
      investments: 300,
      buffer: 200,
      others: 200,
    })
  })

  it('prevents an overallocated plan from being saved', async () => {
    await act(async () => {
      render(<App />)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Set up my budget' }))
    fireEvent.change(screen.getByLabelText('Total monthly plan'), { target: { value: '100' } })

    expect(screen.getByRole('alert')).toHaveTextContent('Your targets are over the monthly plan')
    expect(screen.getByRole('button', { name: 'Close my wallet' })).toBeDisabled()
    expect(localStorage.getItem('budget_config')).toBeNull()
  })

  it('uses defaults and completes onboarding into Add entry', async () => {
    await act(async () => {
      render(<App />)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Use defaults' }))
    expect(screen.getByText('Ready for this month')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add my first expense' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Add entry' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(localStorage.getItem('budget_onboarding_version')).toBe('1')
  })

  it('does not interrupt a user who already has a saved budget', async () => {
    localStorage.setItem('budget_config', JSON.stringify({ monthlyIncome: 1200 }))
    await act(async () => {
      render(<App />)
    })
    expect(screen.queryByRole('heading', { name: 'Make your monthly money plan yours.' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })

  it('opens payment review on PWA entry and categorizes an Apple Pay capture in place', async () => {
    localStorage.setItem('budget_onboarding_version', '1')
    localStorage.setItem('budget_entries', JSON.stringify([{
      id: 'uncategorized-wallet-entry',
      amount: 12.8,
      category: null,
      note: 'Apple Pay · Mystery Noodles',
      date: '2026-07-19',
      source: 'apple-pay',
      merchant: 'Mystery Noodles Pte Ltd',
    }]))

    await act(async () => {
      render(<App />)
    })

    expect(screen.getByRole('dialog', { name: 'Payment needs a category' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const cached = JSON.parse(localStorage.getItem('budget_entries') ?? '[]')
    expect(cached[0]).toMatchObject({ id: 'uncategorized-wallet-entry', category: 'lunch' })
  })

  it('does not interrupt a direct Add entry launch', async () => {
    window.history.replaceState({}, '', '/?add=true')
    await act(async () => {
      render(<App />)
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Add entry' })).toBeInTheDocument()
  })

  it('renders the home tab by default', async () => {
    localStorage.setItem('budget_onboarding_version', '1')
    await act(async () => {
      render(<App />)
    })
    // TabBar renders a nav with aria-label="Main navigation"
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    // Home button is present and active
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('opens the add tab when ?add=true is in the URL', async () => {
    window.history.replaceState({}, '', '/?add=true')
    await act(async () => {
      render(<App />)
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Add entry' })).toBeInTheDocument()
  })

  it('prefills amount and category from the deep link', async () => {
    window.history.replaceState({}, '', '/?add=true&category=lunch&amount=5.80')
    await act(async () => {
      render(<App />)
    })

    expect(await screen.findByLabelText('Entered amount')).toHaveTextContent('5.80')
    expect(screen.getByRole('button', { name: /Lunch/ })).toHaveClass('chip--selected')
  })

  it('prefills the amount but selects no chip for an unknown category', async () => {
    window.history.replaceState({}, '', '/?add=true&category=petrol&amount=3.20')
    await act(async () => {
      render(<App />)
    })

    expect(await screen.findByLabelText('Entered amount')).toHaveTextContent('3.20')
    expect(screen.getByRole('button', { name: /Lunch/ })).not.toHaveClass('chip--selected')
  })

  it('restores the selected theme on app startup', async () => {
    localStorage.setItem('budget_onboarding_version', '1')
    localStorage.setItem('budget-tracker-theme-v2', 'copper-current')

    await act(async () => {
      render(<App />)
    })

    expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
  })

  it('keeps the five-tab shell visible on Insights and Settings', async () => {
    localStorage.setItem('budget_onboarding_version', '1')
    await act(async () => {
      render(<App />)
    })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Insights' })))
    expect(await screen.findByRole('heading', { level: 1, name: /Insights/ }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Settings' })))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  }, 15_000)

  it('opens Automatic Tracking from a stale-capture warning on Home', async () => {
    localStorage.setItem('budget_onboarding_version', '1')
    localStorage.setItem('budget_entries', JSON.stringify([
      { id: 'capture-1', amount: 5, category: 'lunch', note: '', date: '2020-01-01', source: 'apple-pay' },
      { id: 'capture-2', amount: 5, category: 'lunch', note: '', date: '2020-01-03', source: 'dbs-email' },
      { id: 'capture-3', amount: 5, category: 'lunch', note: '', date: '2020-01-05', source: 'apple-pay' },
    ]))

    await act(async () => {
      render(<App />)
    })

    expect(screen.getByRole('status', { name: 'Automatic captures may have stopped' }))
      .toHaveTextContent('No automatic captures since Jan 5')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check Automatic Tracking' })))

    expect(await screen.findByRole('heading', { level: 1, name: 'Automatic tracking' }, { timeout: 10_000 }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  }, 15_000)
})

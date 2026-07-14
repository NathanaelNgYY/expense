import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen } from '@testing-library/react'
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
  it('renders the home tab by default', async () => {
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

  it('restores the selected theme on app startup', async () => {
    localStorage.setItem('budget-tracker-theme-v2', 'copper-current')

    await act(async () => {
      render(<App />)
    })

    expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
  })
})

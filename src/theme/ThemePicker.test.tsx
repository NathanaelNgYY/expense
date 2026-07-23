import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeContext'
import ThemePicker from './ThemePicker'
import { THEMES } from './themeRegistry'

describe('ThemePicker', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders every theme as an accessible radio', () => {
    render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    )

    expect(screen.getAllByRole('radio')).toHaveLength(THEMES.length)
    expect(screen.getByRole('radio', { name: /Original Dark/i })).toBeChecked()
  })

  it('offers a light theme, not only dark ones (U2)', () => {
    render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    )

    act(() => screen.getByRole('radio', { name: /Daylight Ledger/i }).click())

    expect(screen.getByRole('radio', { name: /Daylight Ledger/i })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('daylight')
    expect(localStorage.getItem('budget-tracker-theme-v2')).toBe('daylight')
  })

  it('selects a theme and announces persistence', () => {
    render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    )

    act(() => screen.getByRole('radio', { name: /Deep Sea/i }).click())

    expect(screen.getByRole('radio', { name: /Deep Sea/i })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Theme applied and saved')
  })
})

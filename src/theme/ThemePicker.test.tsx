import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeContext'
import ThemePicker from './ThemePicker'

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

    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /Original Dark/i })).toBeChecked()
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

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

function Probe() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <output aria-label="theme">{theme}</output>
      <button type="button" onClick={() => setTheme('copper-current')}>
        Copper
      </button>
    </>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to Original Dark and applies it to the document', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('theme')).toHaveTextContent('original-dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'original-dark')
  })

  it('restores a valid stored theme', () => {
    localStorage.setItem('budget-tracker-theme-v2', 'berry-circuit')

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('theme')).toHaveTextContent('berry-circuit')
  })

  it('rejects an invalid stored theme', () => {
    localStorage.setItem('budget-tracker-theme-v2', 'unknown')

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByLabelText('theme')).toHaveTextContent('original-dark')
  })

  it('updates the root and storage after selection', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    act(() => screen.getByRole('button', { name: 'Copper' }).click())

    expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
    expect(localStorage.getItem('budget-tracker-theme-v2')).toBe('copper-current')
  })

  it('keeps switching when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    act(() => screen.getByRole('button', { name: 'Copper' }).click())

    expect(document.documentElement).toHaveAttribute('data-theme', 'copper-current')
    expect(screen.getByLabelText('theme')).toHaveTextContent('copper-current')
  })
})

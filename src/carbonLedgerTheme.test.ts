import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new NodeURL('./carbon-ledger.css', import.meta.url)), 'utf8')

describe('Carbon Ledger theme', () => {
  it('defines the approved palette and typography tokens', () => {
    expect(css).toContain('--carbon-canvas: #1a1b1c')
    expect(css).toContain('--carbon-surface: #202223')
    expect(css).toContain('--carbon-text: #ece9e4')
    expect(css).toContain('--carbon-copper: #c98d68')
    expect(css).toContain('--carbon-display:')
  })

  it.each([
    '.tab-bar',
    '.summary-card',
    '.amount-display',
    '.entry-list',
    '.settings-input',
    '.poker-stats-card',
    '.shared-budget-card',
    '.shared-auth',
  ])('covers the %s surface', selector => {
    expect(css).toContain(selector)
  })
})

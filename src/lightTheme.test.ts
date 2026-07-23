import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEMES } from './theme/themeRegistry'

const themesCss = readFileSync(
  fileURLToPath(new NodeURL('./themes.css', import.meta.url)),
  'utf8',
)
const carbonCss = readFileSync(
  fileURLToPath(new NodeURL('./carbon-ledger.css', import.meta.url)),
  'utf8',
)
const indexCss = readFileSync(
  fileURLToPath(new NodeURL('./index.css', import.meta.url)),
  'utf8',
)

/** The `[data-theme='daylight']` block, isolated from the rest of the stylesheet. */
function daylightBlock(): string {
  const start = themesCss.indexOf("[data-theme='daylight']")
  expect(start, 'themes.css must define a daylight theme block').toBeGreaterThan(-1)
  const open = themesCss.indexOf('{', start)
  const close = themesCss.indexOf('}', open)
  return themesCss.slice(open + 1, close)
}

function readToken(block: string, token: string): string {
  const match = new RegExp(`${token}:\\s*([^;]+);`).exec(block)
  expect(match, `daylight must define ${token}`).not.toBeNull()
  return match![1].trim()
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4]
    .map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map(channel =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

const WCAG_AA = 4.5

describe('Daylight Ledger light theme (U2)', () => {
  it('is registered as a selectable theme', () => {
    const daylight = THEMES.find(theme => theme.id === 'daylight')
    expect(daylight).toBeDefined()
    expect(daylight!.name).toBe('Daylight Ledger')
    expect(daylight!.swatches).toHaveLength(3)
  })

  it('opts native controls into light rendering', () => {
    // Without this the date input and its picker stay dark on a paper page.
    expect(daylightBlock()).toContain('color-scheme: light')
  })

  it('inverts the canvas: every surface is lighter than every ink', () => {
    const block = daylightBlock()
    const surfaces = ['--carbon-canvas', '--carbon-surface', '--carbon-surface-raised']
      .map(token => readToken(block, token))
      .map(relativeLuminance)
    const inks = ['--carbon-text', '--carbon-text-secondary', '--carbon-text-tertiary']
      .map(token => readToken(block, token))
      .map(relativeLuminance)

    expect(Math.min(...surfaces)).toBeGreaterThan(Math.max(...inks))
  })

  it.each([
    '--carbon-text',
    '--carbon-text-secondary',
    '--carbon-text-tertiary',
    '--carbon-copper',
    '--carbon-sage',
    '--carbon-amber',
    '--carbon-brick',
  ])('%s clears WCAG AA on all three surfaces', token => {
    const block = daylightBlock()
    const foreground = readToken(block, token)

    for (const surface of ['--carbon-canvas', '--carbon-surface', '--carbon-surface-raised']) {
      expect(contrastRatio(foreground, readToken(block, surface))).toBeGreaterThanOrEqual(
        WCAG_AA,
      )
    }
  })

  it.each(['--carbon-copper', '--carbon-sage', '--carbon-brick'])(
    '%s carries canvas-colored button text at AA',
    token => {
      // .save-btn and .chip--selected paint --carbon-canvas onto these accents.
      const block = daylightBlock()
      expect(
        contrastRatio(readToken(block, token), readToken(block, '--carbon-canvas')),
      ).toBeGreaterThanOrEqual(WCAG_AA)
    },
  )
})

describe('theme token leaks', () => {
  it('tokenizes the tab bar surface instead of hardcoding a dark hex', () => {
    // Was `background: #181a1b` — the one hardcoded surface in an otherwise
    // fully tokenized file, and a dark bar stranded on a light page.
    const tabBar = /(?:^|\n)\.tab-bar\s*\{([^{}]*)\}/.exec(carbonCss)
    expect(tabBar, 'carbon-ledger.css must style .tab-bar').not.toBeNull()
    expect(tabBar![1]).toContain('background: var(--carbon-chrome)')
  })

  it.each(['daylight', 'deep-sea'])('theme %s sets its own chrome surface', id => {
    // A theme that skips it inherits Original Dark's charcoal bar.
    const block = new RegExp(`\\[data-theme='${id}'\\]\\s*\\{([^{}]*)\\}`).exec(themesCss)
    expect(block, `themes.css must define ${id}`).not.toBeNull()
    expect(block![1]).toContain('--carbon-chrome:')
  })

  it('has no literal Original Dark gold left in index.css', () => {
    // Raw `rgba(212, 175, 106, α)` leaks the dark theme's accent into every
    // other theme wherever carbon-ledger.css does not re-declare the rule.
    expect(indexCss).not.toContain('rgba(212, 175, 106')
  })

  it('has no literal sage or brick tints left in index.css', () => {
    expect(indexCss).not.toContain('rgba(111, 174, 122')
    expect(indexCss).not.toContain('rgba(201, 106, 90')
  })
})

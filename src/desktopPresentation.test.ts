import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(fileURLToPath(new NodeURL('./index.css', import.meta.url)), 'utf8')

describe('desktop presentation of the app column (M5)', () => {
  const wideBlock = indexCss.match(/@media \(min-width: 700px\) \{[\s\S]*?\n\}/)?.[0]

  it('defines a single wide-viewport block', () => {
    expect(indexCss.match(/@media \(min-width: 700px\)/g)).toHaveLength(1)
    expect(wideBlock).toBeDefined()
  })

  it('derives the backdrop from theme tokens and outranks the themes.css blanket rule', () => {
    expect(wideBlock).toMatch(/html body,\s*html #root \{[^}]*color-mix\(in srgb, var\(--bg\)/s)
  })

  it('frames the app column with elevation and a token-derived hairline', () => {
    expect(wideBlock).toMatch(/\.app \{[^}]*box-shadow/s)
    expect(wideBlock).toMatch(/\.app \{[^}]*border-inline: 1px solid color-mix\(in srgb, var\(--text\)/s)
  })

  it('keeps the column width untouched (no max-width overrides in the wide block)', () => {
    expect(wideBlock).not.toContain('max-width')
  })
})

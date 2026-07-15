import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(fileURLToPath(new NodeURL('./index.css', import.meta.url)), 'utf8')
const themesCss = readFileSync(fileURLToPath(new NodeURL('./themes.css', import.meta.url)), 'utf8')

describe('dashboard pass card styling', () => {
  it('uses the elevated theme surface instead of decorative gradients in every theme', () => {
    expect(indexCss).toMatch(/\.pass\s*\{[^}]*background:\s*var\(--bg-elev\)/s)

    const passRules = `${indexCss}\n${themesCss}`.match(/(?:\[data-theme='[^']+'\]\s+)?\.pass\s*\{[^}]*\}/g)

    expect(passRules).toHaveLength(4)
    expect(passRules?.every((rule) => !rule.includes('gradient('))).toBe(true)
  })
})

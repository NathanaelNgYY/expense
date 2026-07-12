import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new NodeURL('./index.css', import.meta.url)), 'utf8')

describe('mobile app shell layout', () => {
  it('bounds the main region so screens can scroll inside the standalone iPhone viewport', () => {
    expect(css).toMatch(
      /\.app\s*>\s*main\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*display:\s*flex[^}]*flex-direction:\s*column/s,
    )
    expect(css).toMatch(/\.screen\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s)
  })
})

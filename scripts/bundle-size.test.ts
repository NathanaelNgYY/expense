import { describe, expect, it } from 'vitest'
import { initialAssetNames } from './bundle-size.mjs'

describe('initial bundle asset discovery', () => {
  it('counts the entry script and every eager module preload as initial JavaScript', () => {
    const html = `
      <script type="module" src="/assets/index-abc.js"></script>
      <link rel="modulepreload" href="/assets/format-def.js">
      <link rel="modulepreload" href="/assets/supabase-ghi.js">
      <link rel="stylesheet" href="/assets/index-abc.css">
    `

    expect(initialAssetNames(html, 'js')).toEqual([
      'index-abc.js',
      'format-def.js',
      'supabase-ghi.js',
    ])
    expect(initialAssetNames(html, 'css')).toEqual(['index-abc.css'])
  })

  it('does not count lazy route chunks that are absent from the initial HTML', () => {
    const html = '<script type="module" src="/assets/index-abc.js"></script>'

    expect(initialAssetNames(html, 'js')).toEqual(['index-abc.js'])
  })
})

// Fails the build when the *initial* payload grows past its budget.
//
// Measure every JavaScript and stylesheet asset referenced by the built HTML.
// This includes modulepreload dependencies, which the browser eagerly downloads
// on a first visit, while still excluding lazy route chunks.
//
// Budgets are gzipped KiB, set ~4% above the 2026-07-14 measurement (137.2 / 11.2).
// Lower them as H11/M14 bundle work lands; raise them only with a deliberate reason.
// Note these read lower than Vite's build log, which prints kB (1000 bytes), not KiB.
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initialAssetNames } from './bundle-size.mjs'

const DIST_DIR = join(process.cwd(), 'dist')
const ASSETS_DIR = join(process.cwd(), 'dist', 'assets')
const KB = 1024

const BUDGETS = [
  { label: 'initial JS', kind: 'js', budgetKb: 143 },
  // The always-available ConfirmDialog + LazyFallback styles (M1/M2) are deliberately in the
  // main chunk (see docs/superpowers/specs/2026-07-16-m1-m2-m4-ux-a11y-design.md). The old 12
  // KiB budget sat exactly at the pre-change actual with zero headroom, so that CSS pushed it
  // over. 13 KiB is set just above the 12.3 KiB post-change actual, preserving the same
  // regression-catching intent as the M14 JS budget (a small deliberate margin, not open-ended).
  { label: 'CSS', kind: 'css', budgetKb: 13 },
]

const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8')
const results = BUDGETS.map(({ label, kind, budgetKb }) => {
  const assets = initialAssetNames(html, kind)
  if (assets.length === 0) {
    throw new Error(
      `No initial ${kind.toUpperCase()} assets were found in dist/index.html. ` +
        'Did the build output format change?',
    )
  }

  const gzippedKb =
    assets.reduce((total, file) => total + gzipSync(readFileSync(join(ASSETS_DIR, file))).length, 0) / KB

  return { label, assets, gzippedKb, budgetKb, overBudget: gzippedKb > budgetKb }
})

for (const { label, assets, gzippedKb, budgetKb, overBudget } of results) {
  const status = overBudget ? 'OVER BUDGET' : 'ok'
  console.log(`${label.padEnd(9)} ${gzippedKb.toFixed(1).padStart(6)} KB gzip  (budget ${budgetKb} KB)  ${status}`)
  console.log(`           ${assets.join(', ')}`)
}

if (results.some(result => result.overBudget)) {
  console.error(
    '\nInitial payload exceeds its budget. Either shrink it (a dynamic import ' +
      'moves code out of the entry chunk) or raise the budget in scripts/check-bundle-size.mjs on purpose.',
  )
  process.exit(1)
}

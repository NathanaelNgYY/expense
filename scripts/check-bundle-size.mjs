// Fails the build when the *initial* payload grows past its budget.
//
// Only the entry chunk and the stylesheet are measured: those are what every
// visitor downloads before the app renders. Route chunks (Poker, Settings,
// History, ...) are deliberately excluded, so moving code behind a dynamic
// import is rewarded here rather than penalised.
//
// Budgets are gzipped KiB, set ~4% above the 2026-07-13 measurement (159.6 / 11.2).
// Lower them as H11/M14 bundle work lands; raise them only with a deliberate reason.
// Note these read lower than Vite's build log, which prints kB (1000 bytes), not KiB.
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_DIR = join(process.cwd(), 'dist', 'assets')
const KB = 1024

const BUDGETS = [
  { label: 'entry JS', pattern: /^index-.*\.js$/, budgetKb: 166 },
  { label: 'CSS', pattern: /^index-.*\.css$/, budgetKb: 12 },
]

const files = readdirSync(ASSETS_DIR)
const results = BUDGETS.map(({ label, pattern, budgetKb }) => {
  const matches = files.filter(file => pattern.test(file))
  if (matches.length === 0) {
    throw new Error(
      `No ${label} asset matched ${pattern} in dist/assets. ` +
        `Did the build output naming change? Update BUDGETS in this script.`,
    )
  }

  const gzippedKb =
    matches.reduce((total, file) => total + gzipSync(readFileSync(join(ASSETS_DIR, file))).length, 0) / KB

  return { label, gzippedKb, budgetKb, overBudget: gzippedKb > budgetKb }
})

for (const { label, gzippedKb, budgetKb, overBudget } of results) {
  const status = overBudget ? 'OVER BUDGET' : 'ok'
  console.log(`${label.padEnd(9)} ${gzippedKb.toFixed(1).padStart(6)} KB gzip  (budget ${budgetKb} KB)  ${status}`)
}

if (results.some(result => result.overBudget)) {
  console.error(
    '\nInitial payload exceeds its budget. Either shrink it (a dynamic import ' +
      'moves code out of the entry chunk) or raise the budget in scripts/check-bundle-size.mjs on purpose.',
  )
  process.exit(1)
}

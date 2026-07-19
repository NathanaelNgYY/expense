import { currentLocalDate, expect, prepareApp, test } from './fixtures'

test('first-run user records a personal expense', async ({ page }) => {
  await prepareApp(page)
  await page.goto('/')

  await expect(page.getByText('Log your first expense')).toBeVisible()
  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: 'Others', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill('Groceries')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.locator('.save-toast')).toContainText('Saved S$123.00 to Others')
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('budget_entries') ?? '[]'))
  expect(entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ amount: 123, category: 'others', note: 'Groceries' }),
  ]))
})

test('user creates and switches between isolated SGD and MYR wallets', async ({ page }) => {
  await prepareApp(page, [{
    id: 'sgd-existing', amount: 12, category: 'lunch', note: 'Singapore lunch',
    date: currentLocalDate(), currency: 'SGD',
  }])
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Budget & Categories/ }).click()
  await page.getByRole('button', { name: /Switch currency wallet/ }).click()
  await page.getByRole('button', { name: 'Add currency' }).click()
  await page.getByLabel('Monthly amount').fill('3000')
  await page.getByRole('button', { name: 'Create wallet' }).click()

  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: 'Lunch', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.save-toast')).toContainText('Saved RM23.00')
  await expect(page.locator('.pass-meta')).toContainText('RM23 of RM3,000 allocated')

  await page.getByRole('button', { name: /Switch currency wallet, currently MYR/ }).click()
  await page.getByRole('button', { name: /Singapore dollar/ }).click()
  await expect(page.locator('.pass-meta')).toContainText('S$12 of S$1,200 allocated')
  await expect(page.locator('.pass-meta')).not.toContainText('RM23')
})

test('Others is the only flexible-budget UI', async ({ page }) => {
  await prepareApp(page, [{
    id: 'others-1',
    amount: 100,
    category: 'others',
    note: 'Household',
    date: currentLocalDate(),
  }])
  await page.goto('/')

  const othersCard = page.getByRole('button', { name: /Others/ })
  await expect(othersCard).toContainText('S$136.00 left')
  await expect(othersCard).toContainText('Budget S$236')
  await expect(page.locator('.buffer-card')).toHaveCount(0)
  await expect(page.getByText('Buffer', { exact: true })).toHaveCount(0)
})

test('user records a refund that restores personal spending room', async ({ page }) => {
  const date = currentLocalDate()
  await prepareApp(page, [{
    id: 'original-expense',
    amount: 20,
    category: 'lunch',
    note: 'Original lunch',
    date,
  }])
  await page.goto('/')
  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.getByRole('button', { name: 'Refund' }).click()
  await page.getByRole('button', { name: '5', exact: true }).click()
  await page.getByRole('button', { name: 'Lunch', exact: true }).click()
  await page.getByRole('button', { name: 'Save refund' }).click()

  await expect(page.locator('.save-toast')).toContainText('Refunded S$5.00 to Lunch')
  const lunch = page.getByRole('button', { name: /Lunch/ })
  await expect(lunch).toContainText('S$15.00')

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('button', { name: /Refund.*\+S\$5\.00/ })).toBeVisible()
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('budget_entries') ?? '[]'))
  expect(entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ amount: 5, category: 'lunch', kind: 'refund' }),
  ]))
})

test('Add entry accepts a past expense date without visiting History', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await prepareApp(page, [])
  await page.goto('/')
  await page.getByRole('button', { name: 'Add entry' }).click()

  const expenseDate = page.getByLabel('Entry date')
  const dateBox = await expenseDate.boundingBox()
  expect(dateBox?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expenseDate.fill('2026-05-17')
  await page.getByRole('button', { name: '5', exact: true }).click()
  await page.getByRole('button', { name: 'Add for May 17' }).click()

  await expect.poll(async () => page.evaluate(() => {
    const entries = JSON.parse(localStorage.getItem('budget_entries') ?? '[]')
    return entries.some((entry: { amount: number; date: string }) => entry.amount === 5 && entry.date === '2026-05-17')
  })).toBe(true)
})

test('History supports edit, delete, and undo', async ({ page }) => {
  await prepareApp(page, [{
    id: 'history-1',
    amount: 12,
    category: 'lunch',
    note: 'Old note',
    date: currentLocalDate(),
  }])
  await page.goto('/')
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByRole('button', { name: /Old note/ }).click()

  const details = page.getByLabel('Transaction details')
  await details.getByLabel('Amount').fill('15.50')
  await details.getByRole('textbox', { name: 'Note (optional)' }).fill('Updated lunch')
  await details.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByRole('button', { name: /Updated lunch/ })).toContainText('S$15.50')

  await page.getByRole('button', { name: /Updated lunch/ }).click()
  await page.getByLabel('Transaction details').getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete transaction' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transaction deleted' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transaction restored' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Updated lunch/ })).toBeVisible()
})

test('Settings month reset can be undone without losing entries', async ({ page }) => {
  const date = currentLocalDate()
  await prepareApp(page, [
    { id: 'reset-1', amount: 8, category: 'transport', note: 'Bus', date },
    { id: 'reset-2', amount: 20, category: 'lunch', note: 'Lunch', date },
  ])
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: "Reset This Month's Data" }).click()
  // The reset guard is the in-app ConfirmDialog (M2), not a native confirm.
  const confirmDialog = page.getByRole('dialog')
  await expect(confirmDialog).toContainText('Delete 2 entries from this month?')
  await confirmDialog.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('status')).toContainText('Deleted 2 entries')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('status')).toContainText('Restored 2 entries')
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('budget_entries') ?? '[]'))
  expect(entries.map((entry: { id: string }) => entry.id).sort()).toEqual(['reset-1', 'reset-2'])
})

test('five-tab navigation keeps secondary tools under Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepareApp(page)
  await page.goto('/')

  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation.getByRole('button')).toHaveCount(5)
  await expect(navigation.getByRole('button')).toHaveText(['Home', 'History', 'Add', 'Insights', 'Settings'])

  await navigation.getByRole('button', { name: 'Insights' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Insights/ })).toBeVisible()
  await expect(page.getByText('Category Breakdown')).toBeVisible()

  await navigation.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: /Poker tracker/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Poker tracker' })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()

  await page.getByRole('button', { name: /Shared budgets/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Shared budgets' })).toBeVisible()
  await expect(navigation).toBeVisible()
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  const targets = await navigation.getByRole('button').evaluateAll(buttons =>
    buttons.map(button => {
      const rect = button.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }),
  )
  expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true)
})

test('automatic tracking meal timing degrades safely when preferences are offline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepareApp(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Automatic Tracking/ }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Meal timing' })).toBeVisible()
  await expect(page.getByText('Could not load meal timing')).toBeVisible()
  const retry = page.getByRole('button', { name: 'Try again' })
  const box = await retry.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

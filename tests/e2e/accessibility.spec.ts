import AxeBuilder from '@axe-core/playwright'
import { currentLocalDate, expect, localDateMonthsBack, prepareApp, test } from './fixtures'

async function expectAccessiblePage(page: Parameters<typeof prepareApp>[0], name: string) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

test('primary screens have a page heading and no automated WCAG A/AA violations', async ({ page }) => {
  await prepareApp(page)
  await page.goto('/')
  await expectAccessiblePage(page, 'Dashboard')

  await page.getByRole('button', { name: 'Add entry' }).click()
  await expectAccessiblePage(page, 'Add entry')

  await page.getByRole('button', { name: 'History' }).click()
  await expectAccessiblePage(page, 'History')

  await page.getByRole('button', { name: 'Insights' }).click()
  await expectAccessiblePage(page, 'Insights')

  await page.getByRole('button', { name: 'Settings' }).click()
  await expectAccessiblePage(page, 'Settings')

  await page.getByRole('button', { name: /Poker tracker/ }).click()
  await expectAccessiblePage(page, 'Poker tracker')
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()

  await page.getByRole('button', { name: /Shared budgets/ }).click()
  await expectAccessiblePage(page, 'Shared budgets')
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()

  await page.getByRole('button', { name: /Automatic Tracking/ }).click()
  await expectAccessiblePage(page, 'Automatic tracking')
  await expect(page.getByText('PayNow has no native Shortcuts trigger')).toBeVisible()
})

test('currency wallet sheet has no automated WCAG A/AA violations', async ({ page }) => {
  await prepareApp(page, [
    { id: 'sgd', amount: 12, category: 'lunch', note: '', date: currentLocalDate(), currency: 'SGD' },
    { id: 'myr', amount: 20, category: 'lunch', note: '', date: currentLocalDate(), currency: 'MYR' },
  ])
  await page.addInitScript(() => {
    const budget = JSON.parse(localStorage.getItem('budget_config') ?? '{}')
    localStorage.setItem('budget_wallets_v2', JSON.stringify({
      SGD: { config: budget, customCategories: [], overrides: {} },
      MYR: { config: { ...budget, monthlyIncome: 3000 }, customCategories: [], overrides: {} },
    }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Switch currency wallet/ }).click()
  await expect(page.getByRole('dialog', { name: 'Switch wallet' })).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

// U2: the light theme inverts every surface, so it is the one theme where a stale
// hardcoded dark color shows up as a real contrast failure rather than as a slightly
// off tint. Unit tests measure the palette; this measures what actually renders.
test('the light theme has no automated WCAG A/AA violations on primary screens', async ({
  page,
}) => {
  await prepareApp(page, [
    { id: 'l1', amount: 5.8, category: 'lunch', note: 'toast', date: currentLocalDate() },
    { id: 'l2', amount: 22, category: 'others', note: 'haircut', date: currentLocalDate() },
    // Two complete months so the Insights step below audits the F6 chart itself.
    // Empty Insights only ever renders the pending sentence, which proves nothing
    // about the bars, the hatched partial month or the dashed average line.
    { id: 'l3', amount: 240, category: 'lunch', note: '', date: localDateMonthsBack(1) },
    { id: 'l4', amount: 210, category: 'lunch', note: '', date: localDateMonthsBack(2) },
  ])
  await page.addInitScript(() =>
    localStorage.setItem('budget-tracker-theme-v2', 'daylight'),
  )
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'daylight')

  await expectAccessiblePage(page, 'Dashboard')

  await page.getByRole('button', { name: 'Add entry' }).click()
  await expectAccessiblePage(page, 'Add entry')

  await page.getByRole('button', { name: 'History' }).click()
  await expectAccessiblePage(page, 'History')

  await page.getByRole('button', { name: 'Insights' }).click()
  await expectAccessiblePage(page, 'Insights')

  await page.getByRole('button', { name: 'Settings' }).click()
  await expectAccessiblePage(page, 'Settings')

  await page.getByRole('button', { name: /Appearance/ }).click()
  await expectAccessiblePage(page, 'Appearance')

  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await page.getByRole('button', { name: /Poker tracker/ }).click()
  await expectAccessiblePage(page, 'Poker tracker')
})

test('keyboard focus reaches named navigation and form controls', async ({ page }) => {
  await prepareApp(page)
  await page.goto('/')

  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await navigation.getByRole('button', { name: 'Home' }).focus()
  await page.keyboard.press('Tab')
  await expect(navigation.getByRole('button', { name: 'History' })).toBeFocused()
  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.getByRole('button', { name: '1', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '2', exact: true })).toBeFocused()
})

test('critical mobile controls expose at least a 44 by 44 pixel target', async ({ page }) => {
  await prepareApp(page)
  await page.goto('/')

  for (const control of [
    page.getByRole('button', { name: 'Settings' }),
    page.getByRole('button', { name: 'Home' }),
    page.getByRole('button', { name: 'Add entry' }),
  ]) {
    const box = await control.boundingBox()
    expect(box, 'control should have a rendered target').not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  await page.getByRole('button', { name: 'History' }).click()
  for (const name of ['Previous month', 'Next month']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box, `${name} should have a rendered target`).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Automatic Tracking/ }).click()
  for (const name of ['Copy endpoint', 'Refresh status', 'Back']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box, `${name} should have a rendered target`).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

test('primary screens stay usable on SE-class short viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await prepareApp(page, [{
    id: 'short-1',
    amount: 12,
    category: 'lunch',
    note: 'Lunch',
    date: currentLocalDate(),
  }])
  await page.goto('/')

  const expectNoHorizontalOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // A control trapped behind the opaque fixed tab bar is the failure this guard
  // exists to catch. boundingBox() alone can't see ancestor clipping, so assert
  // the control's bottom edge clears the tab bar's top edge after scrolling.
  const expectClearsTabBar = async (control: ReturnType<typeof page.getByRole>) => {
    const [controlBox, tabBarBox] = await Promise.all([
      control.boundingBox(),
      page.getByRole('navigation', { name: 'Main navigation' }).boundingBox(),
    ])
    expect(controlBox, 'control must be rendered').not.toBeNull()
    expect(tabBarBox, 'tab bar must be rendered').not.toBeNull()
    expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(tabBarBox!.y + 1)
  }

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expectNoHorizontalOverflow()

  // Add: after entering an amount, the save control must be reachable and tappable.
  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.getByRole('button', { name: '5', exact: true }).click()
  const save = page.getByRole('button', { name: /^(Save|Add for)/ })
  await save.scrollIntoViewIfNeeded()
  const saveBox = await save.boundingBox()
  expect(saveBox?.height).toBeGreaterThanOrEqual(44)
  await expectClearsTabBar(save)
  await expectNoHorizontalOverflow()

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible()
  await expectNoHorizontalOverflow()

  await page.getByRole('button', { name: 'Insights' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Insights/ })).toBeVisible()
  await expectNoHorizontalOverflow()

  // Settings: the danger-zone reset button sits at the bottom and must be scrollable
  // into a tappable position.
  await page.getByRole('button', { name: 'Settings' }).click()
  const reset = page.getByRole('button', { name: "Reset This Month's Data" })
  await reset.scrollIntoViewIfNeeded()
  const resetBox = await reset.boundingBox()
  expect(resetBox?.height).toBeGreaterThanOrEqual(44)
  await expectClearsTabBar(reset)
  await expectNoHorizontalOverflow()
})

test('desktop backdrop renders behind the app column on wide viewports (M5)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await prepareApp(page)
  await page.goto('/')

  // At >=700px the page backdrop must be darker than the app column (M5). If a
  // future cascade change lets themes.css's blanket `background: var(--bg)` win
  // again, body and .app collapse to the same color and this fails.
  const [bodyBg, appBg] = await Promise.all([
    page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    page.evaluate(() => getComputedStyle(document.querySelector('.app')).backgroundColor),
  ])
  expect(bodyBg).not.toBe(appBg)
})

// F6. The Trends chart is the only place in the app that states a number through
// geometry, so it is the only place where a screen reader depends entirely on an
// authored label. Empty Insights renders the pending sentence instead, which is
// why the default a11y sweep above cannot cover this.
test('the Insights trend chart has no automated WCAG A/AA violations', async ({ page }) => {
  await prepareApp(page, [
    { id: 't1', amount: 240, category: 'lunch', note: '', date: localDateMonthsBack(2) },
    { id: 't2', amount: 40, category: 'transport', note: '', date: localDateMonthsBack(2) },
    { id: 't3', amount: 300, category: 'lunch', note: '', date: localDateMonthsBack(1) },
    { id: 't4', amount: 90, category: 'lunch', note: '', date: currentLocalDate() },
  ])
  await page.goto('/#/insights')

  await expect(page.getByRole('img', { name: /^Six-month spending:/ })).toBeVisible()
  await expectAccessiblePage(page, 'Insights')
})

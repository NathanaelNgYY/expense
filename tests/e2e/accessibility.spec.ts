import AxeBuilder from '@axe-core/playwright'
import { currentLocalDate, expect, prepareApp, test } from './fixtures'

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

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expectNoHorizontalOverflow()

  // Add: after entering an amount, the save control must be reachable and tappable.
  await page.getByRole('button', { name: 'Add entry' }).click()
  await page.getByRole('button', { name: '5', exact: true }).click()
  const save = page.getByRole('button', { name: /^(Save|Add for)/ })
  await save.scrollIntoViewIfNeeded()
  const saveBox = await save.boundingBox()
  expect(saveBox?.height).toBeGreaterThanOrEqual(44)
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
  await expectNoHorizontalOverflow()
})

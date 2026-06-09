import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Settings from './Settings'

function renderSettings(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<Settings onBack={() => undefined} />)
  })

  return { container, root }
}

function changeInput(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickSave(container: HTMLElement): void {
  const button = [...container.querySelectorAll('button')].find(element =>
    element.textContent?.includes('Save Budgets'),
  )

  if (!button) throw new Error('Save Budgets button was not found')

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function importCsv(container: HTMLElement, csv: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')

  if (!input) throw new Error('Import CSV input was not found')

  const file = new File([csv], 'budget-entries.csv', { type: 'text/csv' })

  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  })

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Settings monthly income', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
    localStorage.clear()
  })

  it('saves an edited monthly income', () => {
    const rendered = renderSettings()
    root = rendered.root

    const input = rendered.container.querySelector<HTMLInputElement>('#budget-monthly-income')
    expect(input).not.toBeNull()

    changeInput(input!, '1800')
    clickSave(rendered.container)

    expect(JSON.parse(localStorage.getItem('budget_config') ?? '{}')).toMatchObject({
      monthlyIncome: 1800,
    })
  })

  it('imports CSV entries into local storage', async () => {
    const existingEntry = {
      id: 'entry-1',
      amount: 3.5,
      category: 'transport',
      note: 'Train',
      date: '2026-05-10',
    }
    localStorage.setItem('budget_entries', JSON.stringify([existingEntry]))
    const rendered = renderSettings()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Import CSV')

    await importCsv(
      rendered.container,
      [
        '"id","amount","category","note","date"',
        '"entry-1","3.5","transport","Train","2026-05-10"',
        '"entry-2","12.5","lunch","Chicken rice","2026-05-11"',
      ].join('\n'),
    )

    expect(JSON.parse(localStorage.getItem('budget_entries') ?? '[]')).toEqual([
      existingEntry,
      {
        id: 'entry-2',
        amount: 12.5,
        category: 'lunch',
        note: 'Chicken rice',
        date: '2026-05-11',
      },
    ])
  })
})

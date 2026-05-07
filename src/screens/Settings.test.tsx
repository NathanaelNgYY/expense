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
})

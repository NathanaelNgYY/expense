import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BudgetConfigProvider } from '../BudgetConfigContext'
import FirstRunBudgetOnboarding from './FirstRunBudgetOnboarding'

describe('FirstRunBudgetOnboarding', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
  })

  afterEach(() => {
    act(() => root?.unmount())
    document.body.replaceChildren()
    localStorage.clear()
    root = null
  })

  it('presents the automatically calculated flexible category as Others', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <BudgetConfigProvider>
          <FirstRunBudgetOnboarding onFinish={() => undefined} />
        </BudgetConfigProvider>,
      )
    })

    const setup = [...container.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Set up my budget'),
    )
    act(() => setup?.click())

    expect(container).toHaveTextContent('Others')
    expect(container).not.toHaveTextContent('Buffer')
  })
})

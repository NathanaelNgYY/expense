import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MealTimeRulesSettings from './MealTimeRulesSettings'

const categories = [
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'cat_dinner', label: 'Dinner', icon: 'Utensils' },
  { id: 'cat_coffee', label: 'Coffee', icon: 'Coffee' },
]

async function renderRules(loadRules = vi.fn().mockResolvedValue([])) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const saveRules = vi.fn().mockResolvedValue(undefined)
  await act(async () => root.render(
    <MealTimeRulesSettings
      categoryOptions={categories}
      loadRules={loadRules}
      saveRules={saveRules}
    />,
  ))
  return { container, root, saveRules }
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(item => item.textContent?.includes(name))
  if (!found) throw new Error(`Missing button: ${name}`)
  return found
}

describe('MealTimeRulesSettings', () => {
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    document.body.replaceChildren()
    root = null
  })

  it('adds an evening rule using a custom Dinner category and saves it', async () => {
    const rendered = await renderRules()
    root = rendered.root

    await act(async () => button(rendered.container, 'Add time window').click())
    const select = rendered.container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('cat_dinner')

    await act(async () => button(rendered.container, 'Save meal timing').click())
    expect(rendered.saveRules).toHaveBeenCalledWith([
      expect.objectContaining({ categoryId: 'cat_dinner', startMinute: 990, endMinute: 1440 }),
    ])
    expect(rendered.container).toHaveTextContent('Meal timing saved')
  })

  it('allows any custom category to be selected for a food window', async () => {
    const rendered = await renderRules()
    root = rendered.root
    await act(async () => button(rendered.container, 'Add time window').click())

    const select = rendered.container.querySelector('select') as HTMLSelectElement
    await act(async () => {
      select.value = 'cat_coffee'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => button(rendered.container, 'Save meal timing').click())

    expect(rendered.saveRules).toHaveBeenCalledWith([
      expect.objectContaining({ categoryId: 'cat_coffee' }),
    ])
  })

  it('shows a retryable error when preferences cannot be loaded', async () => {
    const rendered = await renderRules(vi.fn().mockRejectedValue(new Error('offline')))
    root = rendered.root
    expect(rendered.container).toHaveTextContent('Could not load meal timing')
    expect(button(rendered.container, 'Try again')).toBeInTheDocument()
  })
})

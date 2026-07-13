import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import CategoryEditorForm from './CategoryEditorForm'

function changeInput(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButton(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): void {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('CategoryEditorForm', () => {
  let root: Root | null = null
  let container: HTMLElement

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
  })

  it('disables Done until the label is non-empty and reports trimmed values', () => {
    const onDone = vi.fn()
    root = createRoot(container)
    act(() => {
      root!.render(
        <CategoryEditorForm idPrefix="edit-cat" doneLabel="Done" onDone={onDone} onCancel={() => undefined} />,
      )
    })

    const done = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Done')!
    expect(done.disabled).toBe(true)

    changeInput(container.querySelector<HTMLInputElement>('#edit-cat-name')!, '  Food  ')
    clickButton(container, b => b.getAttribute('aria-label') === 'Icon Heart')
    expect(done.disabled).toBe(false)
    clickButton(container, b => b.textContent?.trim() === 'Done')

    expect(onDone).toHaveBeenCalledWith({ label: 'Food', icon: 'Heart', budget: '' })
  })

  it('renders the budget field only when withBudget is set', () => {
    const onDone = vi.fn()
    root = createRoot(container)
    act(() => {
      root!.render(
        <CategoryEditorForm idPrefix="new-cat" withBudget doneLabel="Add" onDone={onDone} onCancel={() => undefined} />,
      )
    })

    changeInput(container.querySelector<HTMLInputElement>('#new-cat-name')!, 'Gym')
    changeInput(container.querySelector<HTMLInputElement>('#new-cat-budget')!, '120')
    clickButton(container, b => b.textContent?.trim() === 'Add')

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ label: 'Gym', budget: '120' }))
  })

  it('calls onCancel from the Cancel button', () => {
    const onCancel = vi.fn()
    root = createRoot(container)
    act(() => {
      root!.render(
        <CategoryEditorForm idPrefix="edit-cat" doneLabel="Done" onDone={() => undefined} onCancel={onCancel} />,
      )
    })
    clickButton(container, b => b.textContent?.trim() === 'Cancel')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

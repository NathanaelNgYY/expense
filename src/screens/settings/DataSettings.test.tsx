import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import DataSettings from './DataSettings'
import { EntriesProvider } from '../../EntriesContext'
import * as dataTransfer from '../../dataTransfer'

vi.mock('../../dataTransfer', async importOriginal => {
  const actual = await importOriginal<typeof import('../../dataTransfer')>()
  return { ...actual, applyImport: vi.fn().mockResolvedValue({ newEntries: 2, newPokerSessions: 1 }) }
})

function renderData(entries: unknown[] = []) {
  localStorage.setItem('budget_entries', JSON.stringify(entries))
  localStorage.setItem('api_token', 'tok')
  // Default stub: returns the seeded entries for fetchEntries (GET /api/entries)
  // and echoes back a created entry for POST (createEntryApi)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        try {
          const body = JSON.parse(init.body as string) as Record<string, unknown>
          return Promise.resolve(
            new Response(JSON.stringify({ id: crypto.randomUUID(), ...body, source: 'manual' }), { status: 200 }),
          )
        } catch {
          return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
        }
      }
      return Promise.resolve(new Response(JSON.stringify(entries), { status: 200 }))
    }),
  )
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <EntriesProvider>
        <DataSettings onDone={() => undefined} />
      </EntriesProvider>,
    )
  })
  return { container, root }
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

  act(() => {
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

// The JSON import handler awaits the real EntriesContext refresh() (network + queue drain),
// which can take a few extra event-loop turns in tests depending on what earlier tests left
// running in the background. Poll with real macrotask boundaries instead of a single flush.
async function waitForText(container: HTMLElement, text: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!container.textContent?.includes(text)) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for text: ${text}`)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
  }
}

function clickButton(container: HTMLElement, predicate: (b: HTMLButtonElement) => boolean): void {
  const button = [...container.querySelectorAll('button')].find(predicate)
  if (!button) throw new Error('Button not found')
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

describe('DataSettings', () => {
  let root: Root | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.replaceChildren()
    root = null
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('groups the five operations under Export and Import headers', () => {
    const rendered = renderData()
    root = rendered.root
    const { container } = rendered
    const sections = [...container.querySelectorAll('.section-title')].map(h => h.textContent)
    expect(sections).toContain('Export')
    expect(sections).toContain('Import')
    expect(container).toHaveTextContent('CSV — entries only')
    expect(container).toHaveTextContent('JSON — full backup')
    expect(container).toHaveTextContent('CSV file')
    expect(container).toHaveTextContent('JSON backup file')
    expect(container).toHaveTextContent('Paste from clipboard')
    expect(container).toHaveTextContent('Duplicates are skipped automatically on import.')
  })

  it('imports CSV entries, deduplicates, reports in place, and does not navigate', async () => {
    const existingEntry = { id: 'entry-1', amount: 3.5, category: 'transport', note: 'Train', date: '2026-05-10' }
    const rendered = renderData([existingEntry])
    root = rendered.root
    await importCsv(
      rendered.container,
      [
        '"id","amount","category","note","date"',
        '"entry-1","3.5","transport","Train","2026-05-10"',
        '"entry-2","12.5","lunch","Chicken rice","2026-05-11"',
      ].join('\n'),
    )
    // The import deduplicates entry-1 (already exists) and adds entry-2. Unlike the
    // old flat Settings screen, success stays on this screen and reports in place.
    expect(rendered.container).toHaveTextContent('Imported 1 entr')
  })

  it('downloads a JSON export from the JSON — full backup row', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const rendered = renderData()
    root = rendered.root
    clickButton(rendered.container, b => b.textContent?.includes('JSON — full backup') ?? false)
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain('application/json')
  })

  it('imports pasted JSON and reports the result', async () => {
    const rendered = renderData()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.includes('Paste from clipboard') ?? false)

    // Locate the textarea via its accessible label, not just the raw id, so the label/input
    // association itself is under test (a screen reader relies on this, not on the id alone).
    const label = [...container.querySelectorAll('label')].find(
      element => element.textContent?.trim() === 'Pasted export',
    )
    if (!label) throw new Error('Pasted export label was not found')
    expect(label.htmlFor).toBe('paste-import-box')
    const box = container.querySelector<HTMLTextAreaElement>(`#${label.htmlFor}`)
    if (!box) throw new Error('Paste import textarea was not found via its label association')
    expect(label.htmlFor).toBe(box.id)

    changeTextarea(
      box,
      JSON.stringify({ schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [], settings: {} }),
    )

    const importButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Import')
    if (!importButton) throw new Error('Import button was not found')
    await act(async () => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitForText(container, 'Imported 2 entries and 1 poker session')

    expect(dataTransfer.applyImport).toHaveBeenCalledOnce()
  })

  it('reports import counts with a sync caveat when the post-import refresh fails', async () => {
    const rendered = renderData()
    root = rendered.root
    const { container } = rendered

    // Let the initial mount refresh (triggered by EntriesProvider) settle normally, then force
    // every subsequent network call to fail so the refresh() inside importJsonText hits its
    // failure path instead of its success path. The data is still safely upserted by applyImport
    // (mocked above to succeed) — only the post-import refresh is made to fail.
    await waitForText(container, 'Export')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    clickButton(container, b => b.textContent?.includes('Paste from clipboard') ?? false)
    const box = container.querySelector<HTMLTextAreaElement>('#paste-import-box')
    if (!box) throw new Error('Paste import textarea was not found')
    changeTextarea(
      box,
      JSON.stringify({ schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [], settings: {} }),
    )

    const importButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Import')
    if (!importButton) throw new Error('Import button was not found')
    await act(async () => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitForText(container, "the list will update on the next successful sync")

    expect(container).toHaveTextContent('Imported 2 entries and 1 poker session')
    // Non-error styling: the import itself succeeded, only the refresh lagged.
    const feedback = [...container.querySelectorAll('p')].find(p => p.textContent?.includes('Imported 2'))
    expect(feedback?.className).not.toContain('save-feedback--error')
  })

  it('disables the JSON backup file trigger while an import is in flight', async () => {
    const rendered = renderData()
    root = rendered.root
    const { container } = rendered

    let resolveImport: (value: { newEntries: number; newPokerSessions: number }) => void = () => {}
    vi.mocked(dataTransfer.applyImport).mockImplementationOnce(
      () => new Promise(resolve => { resolveImport = resolve }),
    )

    clickButton(container, b => b.textContent?.includes('Paste from clipboard') ?? false)
    const box = container.querySelector<HTMLTextAreaElement>('#paste-import-box')
    if (!box) throw new Error('Paste import textarea was not found')
    changeTextarea(
      box,
      JSON.stringify({ schemaVersion: 1, exportedAt: 'x', entries: [], pokerSessions: [], settings: {} }),
    )

    const importButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Import')
    if (!importButton) throw new Error('Import button was not found')
    act(() => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const fileTriggerButton = [...container.querySelectorAll('button')].find(
      b => b.textContent?.includes('JSON backup file'),
    )
    if (!fileTriggerButton) throw new Error('JSON backup file button was not found')
    expect(fileTriggerButton.disabled).toBe(true)

    await act(async () => {
      resolveImport({ newEntries: 0, newPokerSessions: 0 })
    })

    expect(fileTriggerButton.disabled).toBe(false)
  })

  it('shows the validation error for malformed pasted JSON', async () => {
    const rendered = renderData()
    root = rendered.root
    const { container } = rendered

    clickButton(container, b => b.textContent?.includes('Paste from clipboard') ?? false)
    const box = container.querySelector<HTMLTextAreaElement>('#paste-import-box')
    if (!box) throw new Error('Paste import textarea was not found')
    changeTextarea(box, 'nope')

    const importButton = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Import')
    if (!importButton) throw new Error('Import button was not found')
    await act(async () => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitForText(container, 'not a valid JSON export')
  })
})

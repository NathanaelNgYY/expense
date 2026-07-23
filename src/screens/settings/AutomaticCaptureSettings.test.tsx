import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AutomaticCaptureSettings from './AutomaticCaptureSettings'
import { BudgetConfigProvider } from '../../BudgetConfigContext'

vi.mock('./IngestStatusCard', () => ({
  default: ({
    refreshable,
    shortcutInstallUrl,
  }: {
    refreshable?: boolean
    shortcutInstallUrl?: string | null
  }) => (
    <div data-testid="capture-status">
      Status refresh: {refreshable ? 'available' : 'hidden'}
      {' · '}
      Shortcut installer: {shortcutInstallUrl ?? 'unavailable'}
    </div>
  ),
}))

vi.mock('./MealTimeRulesSettings', () => ({
  default: () => <div>Meal timing settings</div>,
}))

function renderSettings(
  endpoint = 'https://project-ref.supabase.co/functions/v1/ingest',
  shortcutInstallUrl: string | null = 'https://www.icloud.com/shortcuts/abc123',
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onDone = vi.fn()

  act(() => root.render(
    <BudgetConfigProvider>
      <AutomaticCaptureSettings
        onDone={onDone}
        ingestEndpoint={endpoint}
        shortcutInstallUrl={shortcutInstallUrl}
      />
    </BudgetConfigProvider>,
  ))

  return { container, root, onDone }
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find(candidate =>
    candidate.textContent?.includes(name),
  )
  if (!match) throw new Error(`Button not found: ${name}`)
  return match
}

describe('AutomaticCaptureSettings', () => {
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    root = null
  })

  it('leads with the installable Apple Pay flow and keeps the native PayNow limitation clear', () => {
    const rendered = renderSettings()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Automatic tracking')
    expect(rendered.container).toHaveTextContent('Set up Apple Pay')
    expect(rendered.container).toHaveTextContent('Finish in Shortcuts')
    expect(rendered.container).toHaveTextContent('Run Immediately')
    expect(rendered.container).toHaveTextContent('Run Shortcut')
    expect(rendered.container).toHaveTextContent('DBS transaction alerts')
    expect(rendered.container).toHaveTextContent('PayNow has no native Shortcuts trigger')
    expect(rendered.container).toHaveTextContent('Status refresh: available')
    expect(rendered.container).toHaveTextContent(
      'Shortcut installer: https://www.icloud.com/shortcuts/abc123',
    )
    expect(rendered.container).toHaveTextContent('Meal timing settings')
    expect(rendered.container.querySelector('a[href="shortcuts://"]')).toHaveTextContent('Open Shortcuts')
  })

  it('shows a recoverable manual fallback when the shared Shortcut link is not configured', () => {
    const rendered = renderSettings(
      'https://project-ref.supabase.co/functions/v1/ingest',
      null,
    )
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Prebuilt Shortcut installer unavailable')
    expect(rendered.container).toHaveTextContent('Shortcut installer: unavailable')
    expect(rendered.container.querySelector('a[href="shortcuts://"]')).toHaveTextContent('Open Shortcuts')
  })

  it('keeps endpoint copying inside the advanced manual setup and never renders a token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const rendered = renderSettings()
    root = rendered.root

    await act(async () => button(rendered.container, 'Copy endpoint').click())

    expect(writeText).toHaveBeenCalledWith('https://project-ref.supabase.co/functions/v1/ingest')
    expect(rendered.container).toHaveTextContent('Endpoint copied')
    expect(rendered.container).toHaveTextContent('Authorization: use the setup value generated above')
    expect(rendered.container.textContent).not.toMatch(/Bearer [A-Za-z0-9_-]{24,}/)
    expect(rendered.container).not.toHaveTextContent('View token setup instructions')
  })

  it('reports clipboard failure inline without hiding the endpoint', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const rendered = renderSettings()
    root = rendered.root

    await act(async () => button(rendered.container, 'Copy endpoint').click())

    expect(rendered.container).toHaveTextContent('Copy failed. Press and hold the endpoint to copy it.')
    expect(rendered.container).toHaveTextContent('https://project-ref.supabase.co/functions/v1/ingest')
  })

  it('disables endpoint copy when Supabase is not configured', () => {
    const rendered = renderSettings('')
    root = rendered.root

    expect(button(rendered.container, 'Copy endpoint')).toBeDisabled()
    expect(rendered.container).toHaveTextContent('Endpoint unavailable in this build')
  })
})

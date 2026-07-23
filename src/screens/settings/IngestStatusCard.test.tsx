import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import IngestStatusCard from './IngestStatusCard'
import { ConfirmProvider } from '../../components/ConfirmDialog'
import { INGEST_BINDING_STORAGE_KEY } from '../../ingestVisibility'

const api = vi.hoisted(() => ({ fetchIngestStatus: vi.fn(), rotateIngestToken: vi.fn() }))
const shared = vi.hoisted(() => ({
  value: {
    authReady: true,
    session: { user: { id: 'user-current', email: 'nat@example.com' } },
    profile: { id: 'user-current', displayName: 'Nat' },
  },
}))

vi.mock('../../api', () => ({
  fetchIngestStatus: api.fetchIngestStatus,
  rotateIngestToken: api.rotateIngestToken,
}))
vi.mock('../../sharedBudgets/SharedBudgetsContext', () => ({ useSharedBudgets: () => shared.value }))

async function renderCard(
  props: { refreshable?: boolean; shortcutInstallUrl?: string | null } = {},
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(<ConfirmProvider><IngestStatusCard {...props} /></ConfirmProvider>))
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
  return { container, root }
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))
  if (!button) throw new Error(`Button "${text}" not found`)
  return button
}

// The confirm dialog renders in document.body (top layer), not inside the card container.
function clickConfirm(label: string): Promise<void> {
  const button = [...document.querySelectorAll('dialog button')].find(b => b.textContent?.trim() === label)
  if (!button) throw new Error(`Confirm button "${label}" not found`)
  return act(async () => (button as HTMLButtonElement).click())
}

describe('IngestStatusCard', () => {
  let root: Root | null = null

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    shared.value.session = { user: { id: 'user-current', email: 'nat@example.com' } }
    shared.value.profile = { id: 'user-current', displayName: 'Nat' }
  })

  afterEach(() => {
    act(() => root?.unmount())
    document.body.replaceChildren()
    root = null
  })

  it('shows the recipient account and last capture returned for the current user', async () => {
    api.fetchIngestStatus.mockResolvedValue({
      recipientUserId: 'user-current',
      tokenLabel: 'ios-shortcut',
      lastCapturedAt: '2026-07-13T09:30:00.000Z',
      lastSource: 'apple_pay',
    })

    const rendered = await renderCard()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Automatic capture')
    expect(rendered.container).toHaveTextContent('nat@example.com')
    expect(rendered.container).toHaveTextContent('Last captured')
    expect(rendered.container.querySelector('time')).toHaveAttribute('datetime', '2026-07-13T09:30:00.000Z')
  })

  it('renders an account mismatch warning using the remembered device recipient', async () => {
    localStorage.setItem(INGEST_BINDING_STORAGE_KEY, JSON.stringify({
      userId: 'user-old',
      accountLabel: 'old@example.com',
      tokenLabel: 'ios-shortcut',
      lastCapturedAt: '2026-07-12T03:00:00.000Z',
    }))
    api.fetchIngestStatus.mockResolvedValue(null)

    const rendered = await renderCard()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Account mismatch')
    expect(rendered.container).toHaveTextContent('old@example.com')
    expect(rendered.container).toHaveTextContent('nat@example.com')
  })

  it('clearly reports when the current account has no Shortcut token', async () => {
    api.fetchIngestStatus.mockResolvedValue(null)

    const rendered = await renderCard()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Receives transactionsNot linked')
    expect(rendered.container).toHaveTextContent('No Shortcut token is linked to this account')
  })

  it('shows a temporary status error without calling it an account mismatch', async () => {
    api.fetchIngestStatus.mockRejectedValue(new Error('network'))

    const rendered = await renderCard()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('Capture status is temporarily unavailable')
    expect(rendered.container).not.toHaveTextContent('Account mismatch')
  })

  it('labels the most recent DBS email capture', async () => {
    api.fetchIngestStatus.mockResolvedValue({
      recipientUserId: 'user-current',
      tokenLabel: '',
      lastCapturedAt: '2026-07-13T09:30:00.000Z',
      lastSource: 'dbs_email',
    })

    const rendered = await renderCard()
    root = rendered.root

    expect(rendered.container).toHaveTextContent('DBS email')
    expect(rendered.container).toHaveTextContent('Linked via iOS Shortcut')
  })

  it('refreshes connection status with immediate inline progress', async () => {
    let resolveRefresh: ((value: null) => void) | undefined
    api.fetchIngestStatus
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve }))

    const rendered = await renderCard({ refreshable: true })
    root = rendered.root
    const refresh = [...rendered.container.querySelectorAll('button')].find(candidate =>
      candidate.textContent?.includes('Refresh status'),
    )
    if (!refresh) throw new Error('Refresh status button not found')

    await act(async () => refresh.click())
    expect(refresh).toBeDisabled()
    expect(refresh).toHaveTextContent('Checking…')

    await act(async () => resolveRefresh?.(null))
    expect(api.fetchIngestStatus).toHaveBeenCalledTimes(2)
    expect(refresh).toBeEnabled()
    expect(refresh).toHaveTextContent('Refresh status')
  })

  it('offers "Generate token" when no token is linked', async () => {
    api.fetchIngestStatus.mockResolvedValue(null)
    const rendered = await renderCard()
    root = rendered.root
    expect(findButton(rendered.container, 'Generate token')).toBeEnabled()
  })

  it('offers "Rotate token" when a token is already linked', async () => {
    api.fetchIngestStatus.mockResolvedValue({
      recipientUserId: 'user-current',
      tokenLabel: 'ios-shortcut',
      lastCapturedAt: '2026-07-13T09:30:00.000Z',
      lastSource: 'apple_pay',
    })
    const rendered = await renderCard()
    root = rendered.root
    expect(findButton(rendered.container, 'Rotate token')).toBeEnabled()
  })

  it('reveals the new token once after confirming, then clears it on Done', async () => {
    api.fetchIngestStatus.mockResolvedValue({
      recipientUserId: 'user-current', tokenLabel: 'ios-shortcut', lastCapturedAt: null, lastSource: null,
    })
    api.rotateIngestToken.mockResolvedValue({ token: 'SECRET-TOKEN-XYZ' })
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })

    const rendered = await renderCard()
    root = rendered.root

    await act(async () => findButton(rendered.container, 'Rotate token').click())
    await clickConfirm('Rotate')

    expect(api.rotateIngestToken).toHaveBeenCalledTimes(1)
    const field = rendered.container.querySelector<HTMLInputElement>('input[aria-label="Shortcut setup value"]')
    expect(field).not.toBeNull()
    expect(field!.value).toBe('Bearer SECRET-TOKEN-XYZ')
    expect(field!.readOnly).toBe(true)

    await act(async () => findButton(rendered.container, 'Copy').click())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bearer SECRET-TOKEN-XYZ')

    await act(async () => findButton(rendered.container, 'Done').click())
    expect(rendered.container.querySelector('input[aria-label="Shortcut setup value"]')).toBeNull()
  })

  it('copies the complete setup value and opens only the configured public installer', async () => {
    api.fetchIngestStatus.mockResolvedValue(null)
    api.rotateIngestToken.mockResolvedValue({ token: 'SECRET-TOKEN-XYZ' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const rendered = await renderCard({
      shortcutInstallUrl: 'https://www.icloud.com/shortcuts/abc123',
    })
    root = rendered.root

    await act(async () => findButton(rendered.container, 'Set up Apple Pay').click())
    await clickConfirm('Continue')

    const install = rendered.container.querySelector<HTMLAnchorElement>(
      'a[href="https://www.icloud.com/shortcuts/abc123"]',
    )
    expect(install).not.toBeNull()
    expect(install).toHaveTextContent('Copy setup value & add Shortcut')
    expect(install).toHaveAttribute('target', '_blank')
    expect(install!.href).not.toContain('SECRET-TOKEN-XYZ')

    await act(async () => install!.click())
    expect(writeText).toHaveBeenCalledWith('Bearer SECRET-TOKEN-XYZ')
    expect(rendered.container).toHaveTextContent('Setup value copied')
  })

  it('keeps the setup value selectable and reports when clipboard access fails', async () => {
    api.fetchIngestStatus.mockResolvedValue(null)
    api.rotateIngestToken.mockResolvedValue({ token: 'SECRET-TOKEN-XYZ' })
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    const rendered = await renderCard({
      shortcutInstallUrl: 'https://www.icloud.com/shortcuts/abc123',
    })
    root = rendered.root

    await act(async () => findButton(rendered.container, 'Set up Apple Pay').click())
    await clickConfirm('Continue')
    const install = rendered.container.querySelector<HTMLAnchorElement>(
      'a[href="https://www.icloud.com/shortcuts/abc123"]',
    )
    await act(async () => install!.click())

    expect(rendered.container).toHaveTextContent(
      'Copy failed. Return here and press and hold the setup value to copy it.',
    )
    expect(
      rendered.container.querySelector<HTMLInputElement>('input[aria-label="Shortcut setup value"]'),
    ).toHaveValue('Bearer SECRET-TOKEN-XYZ')
  })

  it('does not rotate when the confirm is cancelled', async () => {
    api.fetchIngestStatus.mockResolvedValue(null)
    const rendered = await renderCard()
    root = rendered.root

    await act(async () => findButton(rendered.container, 'Generate token').click())
    await clickConfirm('Cancel')

    expect(api.rotateIngestToken).not.toHaveBeenCalled()
  })

  it('shows an error notice when rotation fails and reveals no token', async () => {
    api.fetchIngestStatus.mockResolvedValue(null)
    api.rotateIngestToken.mockRejectedValue(new Error('boom'))

    const rendered = await renderCard()
    root = rendered.root

    await act(async () => findButton(rendered.container, 'Generate token').click())
    await clickConfirm('Generate')

    expect(rendered.container).toHaveTextContent('Could not generate a new token')
    expect(rendered.container.querySelector('input[aria-label="Shortcut setup value"]')).toBeNull()
  })

  it('hides the rotate control when there is no signed-in account', async () => {
    shared.value.session = null as unknown as typeof shared.value.session
    shared.value.profile = null as unknown as typeof shared.value.profile
    api.fetchIngestStatus.mockResolvedValue(null)

    const rendered = await renderCard()
    root = rendered.root

    expect([...rendered.container.querySelectorAll('button')].some(
      b => /Generate token|Rotate token/.test(b.textContent ?? ''),
    )).toBe(false)
  })
})

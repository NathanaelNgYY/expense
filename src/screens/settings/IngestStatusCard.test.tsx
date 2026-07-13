import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import IngestStatusCard from './IngestStatusCard'
import { INGEST_BINDING_STORAGE_KEY } from '../../ingestVisibility'

const api = vi.hoisted(() => ({ fetchIngestStatus: vi.fn() }))
const shared = vi.hoisted(() => ({
  value: {
    authReady: true,
    session: { user: { id: 'user-current', email: 'nat@example.com' } },
    profile: { id: 'user-current', displayName: 'Nat' },
  },
}))

vi.mock('../../api', () => ({ fetchIngestStatus: api.fetchIngestStatus }))
vi.mock('../../sharedBudgets/SharedBudgetsContext', () => ({ useSharedBudgets: () => shared.value }))

async function renderCard(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(<IngestStatusCard />))
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
  return { container, root }
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
})

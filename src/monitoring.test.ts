import type { ErrorInfo } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  loaded: vi.fn(),
}))

vi.mock('@sentry/react', () => {
  sentry.loaded()
  return {
    captureException: sentry.captureException,
    init: sentry.init,
  }
})

async function monitoring() {
  return import('./monitoring')
}

describe('Sentry monitoring', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('does not load Sentry when no public DSN is configured', async () => {
    const { initializeMonitoring } = await monitoring()

    await expect(initializeMonitoring({ dsn: '', environment: 'production' })).resolves.toBe(false)
    expect(sentry.loaded).not.toHaveBeenCalled()
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('loads and initializes monitoring without collecting default PII or performance traces', async () => {
    const { initializeMonitoring } = await monitoring()

    await expect(
      initializeMonitoring({
        dsn: 'https://public@example.ingest.sentry.io/123',
        environment: 'staging',
      }),
    ).resolves.toBe(true)

    expect(sentry.loaded).toHaveBeenCalledOnce()
    expect(sentry.init).toHaveBeenCalledWith({
      dsn: 'https://public@example.ingest.sentry.io/123',
      environment: 'staging',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    })
  })

  it('captures a boundary exception after lazy initialization', async () => {
    const { initializeMonitoring, reportReactError } = await monitoring()
    const error = new Error('render failed')
    const info = { componentStack: '\n at Dashboard' } as ErrorInfo

    void initializeMonitoring({
      dsn: 'https://public@example.ingest.sentry.io/123',
      environment: 'production',
    })
    await reportReactError(error, info)

    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: {
        react: { componentStack: '\n at Dashboard' },
      },
      tags: { source: 'react-error-boundary' },
    })
  })

  it('handles a missing component stack without attaching application state', async () => {
    const { initializeMonitoring, reportReactError } = await monitoring()
    const error = new Error('render failed before React produced a stack')

    await initializeMonitoring({
      dsn: 'https://public@example.ingest.sentry.io/123',
      environment: 'production',
    })
    await reportReactError(error, { componentStack: null })

    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: { react: { componentStack: '' } },
      tags: { source: 'react-error-boundary' },
    })
  })
})

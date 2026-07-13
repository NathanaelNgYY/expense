import type { ErrorInfo } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react'
import { initializeMonitoring, reportReactError } from './monitoring'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  init: vi.fn(),
}))

describe('Sentry monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stays disabled when no public DSN is configured', () => {
    expect(initializeMonitoring({ dsn: '', environment: 'production' })).toBe(false)
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('initializes error monitoring without collecting default PII or performance traces', () => {
    expect(
      initializeMonitoring({
        dsn: 'https://public@example.ingest.sentry.io/123',
        environment: 'staging',
      }),
    ).toBe(true)

    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: 'https://public@example.ingest.sentry.io/123',
      environment: 'staging',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    })
  })

  it('captures a boundary exception with its React component stack and no budget data', () => {
    const error = new Error('render failed')
    const info = { componentStack: '\n at Dashboard' } as ErrorInfo

    reportReactError(error, info)

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: {
        react: { componentStack: '\n at Dashboard' },
      },
      tags: { source: 'react-error-boundary' },
    })
  })

  it('handles a missing component stack without attaching application state', () => {
    const error = new Error('render failed before React produced a stack')

    reportReactError(error, { componentStack: null })

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      contexts: { react: { componentStack: '' } },
      tags: { source: 'react-error-boundary' },
    })
  })
})

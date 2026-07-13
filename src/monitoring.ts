import type { ErrorInfo } from 'react'
import * as Sentry from '@sentry/react'

interface MonitoringConfig {
  dsn?: string
  environment: string
}

export function initializeMonitoring({ dsn, environment }: MonitoringConfig): boolean {
  const normalizedDsn = dsn?.trim()
  if (!normalizedDsn) return false

  Sentry.init({
    dsn: normalizedDsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
  return true
}

export function reportReactError(error: Error, info: ErrorInfo): void {
  Sentry.captureException(error, {
    contexts: {
      react: { componentStack: info.componentStack ?? '' },
    },
    tags: { source: 'react-error-boundary' },
  })
}

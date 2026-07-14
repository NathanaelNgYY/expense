import type { ErrorInfo } from 'react'

type SentryModule = typeof import('./monitoringSentry')

interface MonitoringConfig {
  dsn?: string
  environment: string
}

let initialization: Promise<SentryModule | null> | null = null

export async function initializeMonitoring({ dsn, environment }: MonitoringConfig): Promise<boolean> {
  const normalizedDsn = dsn?.trim()
  if (!normalizedDsn) return false

  if (!initialization) {
    initialization = import('./monitoringSentry')
      .then(Sentry => {
        Sentry.init({
          dsn: normalizedDsn,
          environment,
          sendDefaultPii: false,
          tracesSampleRate: 0,
        })
        return Sentry
      })
      .catch(error => {
        console.error('Error monitoring could not start', {
          message: error instanceof Error ? error.message : 'Unknown error',
        })
        return null
      })
  }

  return (await initialization) !== null
}

export async function reportReactError(error: Error, info: ErrorInfo): Promise<void> {
  const Sentry = await initialization
  if (!Sentry) return

  Sentry.captureException(error, {
    contexts: {
      react: { componentStack: info.componentStack ?? '' },
    },
    tags: { source: 'react-error-boundary' },
  })
}

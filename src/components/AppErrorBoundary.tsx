import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
  onReload: () => void
  onBackup: () => void
}

interface State {
  error: Error | null
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled React error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    })
    this.props.onError?.(error, info)
  }

  private reload = (): void => {
    this.props.onReload()
  }

  private downloadBackup = (): void => {
    this.props.onBackup()
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="app app-error-shell">
        <main className="app-error-boundary">
          <section className="app-error-card" role="alert" aria-labelledby="app-error-title">
            <span className="app-error-icon" aria-hidden="true">
              <AlertTriangle size={26} />
            </span>
            <h1 id="app-error-title">Something went wrong</h1>
            <p>Your entries are still saved on this device. Reload the app, or download a backup first for extra safety.</p>
            <div className="app-error-actions">
              <button type="button" className="primary-btn app-error-action" onClick={this.reload}>
                <RefreshCw aria-hidden="true" size={17} />
                Reload app
              </button>
              <button type="button" className="export-btn app-error-action" onClick={this.downloadBackup}>
                <Download aria-hidden="true" size={17} />
                Download backup
              </button>
            </div>
          </section>
        </main>
      </div>
    )
  }
}

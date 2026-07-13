import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './carbon-ledger.css'
import './themes.css'
import App from './App'
import { initializeMonitoring } from './monitoring'
import { readStoredTheme } from './theme/themeRegistry'

initializeMonitoring({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
})

document.documentElement.dataset.theme = readStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

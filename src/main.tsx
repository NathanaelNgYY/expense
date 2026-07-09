import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './carbon-ledger.css'
import './themes.css'
import App from './App'
import { readStoredTheme } from './theme/themeRegistry'

document.documentElement.dataset.theme = readStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

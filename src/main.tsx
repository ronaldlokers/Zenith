import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './app-styles.css'
import './i18n'
import App from './App.tsx'
import { AuthGate } from './AuthGate.tsx'
import { AiStatusProvider } from './ai-status.tsx'

// Zenith is light-only (see docs/superpowers/specs/2026-08-12-fizzy-shell-design.md),
// so there is no theme to apply before first paint. The legacy
// `zenith_theme` key is deliberately left in localStorage rather than
// cleared: nothing reads it, and leaving it costs nothing while making the
// decision reversible without having to reconstruct anyone's preference.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        <AiStatusProvider>
          <App />
        </AiStatusProvider>
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // best effort: app works fine without offline shell
    })
  })
}

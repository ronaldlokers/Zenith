import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './app-styles.css'
import './i18n'
import App from './App.tsx'
import { AuthGate } from './AuthGate.tsx'

// Applied here (before React renders) rather than in a useEffect, so a
// persisted theme choice doesn't flash the default theme first (#146).
// Legacy "control-room" choices fold into explicit Dark (#346).
{
  const saved = localStorage.getItem('zenith_theme')
  const theme = saved === 'control-room' ? 'dark' : saved
  if (saved === 'control-room') localStorage.setItem('zenith_theme', 'dark')
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        <App />
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

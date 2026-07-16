import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App.tsx'
import { AuthGate } from './AuthGate.tsx'

// Applied here (before React renders) rather than in a useEffect, so a
// persisted "control room" theme choice (#146) doesn't flash the
// default theme first.
if (localStorage.getItem('jobseekr_theme') === 'control-room') {
  document.documentElement.dataset.theme = 'control-room'
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

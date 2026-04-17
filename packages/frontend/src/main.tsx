import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import { initI18n } from '@/lib/i18n'
import App from './App'

// Restore the user's preferred UI language as early as possible so the
// `<html lang>` attribute is correct for screen readers / browser hyphenation
// before React mounts. Used to live as an inline <script> in index.html, but
// the strict production CSP (`script-src 'self'`) blocks inline scripts.
try {
  const savedLang = localStorage.getItem('vpp-lang')
  if (savedLang) document.documentElement.lang = savedLang
} catch {
  // localStorage may be unavailable (privacy mode); ignore.
}

initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

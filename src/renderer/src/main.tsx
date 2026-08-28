import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/golos-text/400.css'
import '@fontsource/golos-text/500.css'
import '@fontsource/golos-text/600.css'
import '@fontsource/golos-text/700.css'
import '@morze/ui/styles.css'
import './app.css'

import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

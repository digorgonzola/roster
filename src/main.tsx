import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'app-switcher/styles.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/print.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

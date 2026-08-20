import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Loads Tailwind v4 configurations
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
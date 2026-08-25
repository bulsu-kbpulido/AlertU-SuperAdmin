import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 🔒 Suppress all console outputs in production for security
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.debug = noop;
  console.trace = noop;
  console.dir = noop;
  console.table = noop;
}

import './index.css' // Loads Tailwind v4 configurations
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
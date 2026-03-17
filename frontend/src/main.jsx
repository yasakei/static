import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './style.css'

const boot = document.getElementById('boot')

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Fade the boot splash once React is mounted.
if (boot) {
  requestAnimationFrame(() => {
    boot.setAttribute('data-state', 'done')
    // Remove from DOM after the fade animation.
    setTimeout(() => boot.remove(), 350)
  })
}
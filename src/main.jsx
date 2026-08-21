import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import './style.css'

// THIS WAS MISSING:
import { NexusProvider } from './context/NexusContext'
// ABOVE `App`, not inside it. `App` is the component that needs `teamId` for the
// dashboard, the staff loads and the notification bell — if it rendered the
// provider itself it would be the provider's parent and could not consume it.
import { TeamGate } from './context/TeamGate'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NexusProvider>
      <TeamGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </TeamGate>
    </NexusProvider>
  </React.StrictMode>,
)

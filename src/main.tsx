import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { createAutoSync } from './sync/autoSync'
import { runSync } from './sync/runSync'

registerSW({ immediate: true })

// Ask the browser not to evict the database under storage pressure (Chrome in particular
// will otherwise clear "best-effort" storage, including IndexedDB, without warning).
if (navigator.storage?.persist) void navigator.storage.persist()

const auto = createAutoSync({ run: runSync })
void auto.kick()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

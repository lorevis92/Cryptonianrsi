import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PublicPage from './components/PublicPage.jsx'
import { AccountProvider } from './lib/account.jsx'
import { pageOf } from './lib/route.js'
import './styles.css'

// /privacy e /termini (o /terms) sono pagine pubbliche con indirizzo diretto; tutto il resto è l'app.
function Root() {
  const [page, setPage] = useState(() => pageOf())
  useEffect(() => {
    const onPop = () => setPage(pageOf())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return page ? <PublicPage page={page} /> : <App />
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AccountProvider><Root /></AccountProvider></React.StrictMode>)

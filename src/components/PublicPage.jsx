import { useEffect } from 'react'
import Icon from './Icon.jsx'
import { LegalPanel, PrivacyPanel } from './Legal.jsx'
import { goTo, leavePage, PATH_OF } from '../lib/route.js'

const TITLES = { privacy: 'Privacy', terms: 'Note legali' }

// Pagina pubblica a tutta schermata: /privacy e /termini (alias /terms). Niente login, niente avvertenza iniziale.
export default function PublicPage({ page }) {
  useEffect(() => {
    const before = document.title
    document.title = `${TITLES[page]} · Cryptonian RSI`
    return () => { document.title = before }
  }, [page])
  const other = page === 'privacy' ? 'terms' : 'privacy'
  return (
    <div className="public">
      <header className="public__top">
        <button className="icon-btn" onClick={leavePage} aria-label="Torna all'app"><Icon name="bubbles" size={20} /></button>
        <a className="brand__name public__brand" href="/" onClick={e => { e.preventDefault(); leavePage() }}>Cryptonian <em>RSI</em></a>
      </header>
      <main className="public__body">
        <h1 className="public__title">{TITLES[page]}</h1>
        {page === 'privacy' ? <PrivacyPanel /> : <LegalPanel />}
        <nav className="public__links" aria-label="Altre pagine">
          <a href={PATH_OF[other]} onClick={e => { e.preventDefault(); goTo(PATH_OF[other]) }}>{TITLES[other]}</a>
          <a href="/" onClick={e => { e.preventDefault(); leavePage() }}>Vai all'app</a>
        </nav>
      </main>
    </div>
  )
}

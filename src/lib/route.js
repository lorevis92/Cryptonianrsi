// Pagine pubbliche con un indirizzo diretto (senza login, anche incollando il link nel browser).
// Su Vercel ogni percorso che non è /api serve index.html (vercel.json), poi qui si sceglie la pagina.
export const PAGES = {
  '/privacy': 'privacy',
  '/termini': 'terms',
  '/terms': 'terms', // alias inglese
}
export const PATH_OF = { privacy: '/privacy', terms: '/termini' }

export const pageOf = (pathname = location.pathname) => PAGES[pathname.replace(/\/+$/, '').toLowerCase()] || null

// Apre una pagina restando nell'app (Indietro torna dov'eri)
export function goTo(path) {
  if (location.pathname !== path) history.pushState({ crsi: 'page' }, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  window.scrollTo(0, 0)
}

// Dalla pagina all'app: se si arrivava dall'app torno indietro, altrimenti (link diretto) vado alla mappa
export function leavePage() {
  if (history.state?.crsi === 'page' && history.length > 1) history.back()
  else { history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate', { state: null })) }
}

import { useCallback, useEffect, useState } from 'react'
import { load, save, onRemote } from './storage.js'

// Preferiti iniziali, poi l'utente li cambia con la stellina. Salvati nel browser (crsi:favorites)
// e, con l'account, anche su Supabase (vedi account.jsx): quando arrivano dall'account si aggiornano qui.
export const DEFAULT_FAVORITES = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT']

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    const v = load('favorites', DEFAULT_FAVORITES)
    return Array.isArray(v) ? v.filter(s => typeof s === 'string') : DEFAULT_FAVORITES
  })
  useEffect(() => save('favorites', favorites), [favorites])
  useEffect(() => onRemote(['favorites'], () => {
    const v = load('favorites', DEFAULT_FAVORITES)
    if (Array.isArray(v)) setFavorites(f => (JSON.stringify(f) === JSON.stringify(v) ? f : v.filter(s => typeof s === 'string')))
  }), [])
  const toggle = useCallback(sym => setFavorites(f => (f.includes(sym) ? f.filter(s => s !== sym) : [...f, sym])), [])
  return [favorites, toggle]
}

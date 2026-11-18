import { useCallback, useEffect, useState } from 'react'
import { load, save } from './storage.js'

// Preferiti iniziali, poi l'utente li cambia con la stellina. Salvati nel browser (crsi:favorites).
export const DEFAULT_FAVORITES = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT']

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    const v = load('favorites', DEFAULT_FAVORITES)
    return Array.isArray(v) ? v.filter(s => typeof s === 'string') : DEFAULT_FAVORITES
  })
  useEffect(() => save('favorites', favorites), [favorites])
  const toggle = useCallback(sym => setFavorites(f => (f.includes(sym) ? f.filter(s => s !== sym) : [...f, sym])), [])
  return [favorites, toggle]
}

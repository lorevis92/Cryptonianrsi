import { useEffect } from 'react'
import Icon from './Icon.jsx'

// Pannello che sale dal basso sul telefono e si apre di lato sul computer.
export default function Sheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet__scrim" aria-label="Chiudi" onClick={onClose} />
      <div className="sheet__panel">
        <div className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi"><Icon name="close" /></button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}

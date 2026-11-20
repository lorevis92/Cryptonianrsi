import { useEffect, useRef, useState } from 'react'

// Ritaglio quadrato della foto profilo: trascina per spostare, cursore (o rotella) per ingrandire.
// Il risultato è 384×384 px, WebP compresso (JPEG se il browser non sa fare WebP), sotto i 200 KB circa.
const VIEW = 260   // lato del riquadro di ritaglio a schermo
const OUT = 384    // lato della foto salvata
const MAX_BYTES = 200 * 1024

export default function AvatarCropper({ file, onCancel, onDone, busy, error }) {
  const canvas = useRef()
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 }) // spostamento in px dello schermo
  const [failed, setFailed] = useState(false)
  const drag = useRef(null)

  // Carico l'immagine (rispettando l'orientamento delle foto del telefono)
  useEffect(() => {
    let alive = true, url = null
    const go = async () => {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
        if (alive) setImg(bmp)
      } catch {
        url = URL.createObjectURL(file)
        const el = new Image()
        el.onload = () => alive && setImg(el)
        el.onerror = () => alive && setFailed(true)
        el.src = url
      }
    }
    go()
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [file])

  // Misure: a zoom 1 il lato corto riempie il riquadro
  const w = img?.width || 1, h = img?.height || 1
  const base = VIEW / Math.min(w, h)
  const scale = base * zoom
  const maxX = Math.max(0, (w * scale - VIEW) / 2), maxY = Math.max(0, (h * scale - VIEW) / 2)
  const clamp = p => ({ x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) })

  useEffect(() => { setPos(p => clamp(p)) }, [zoom, img]) // eslint-disable-line react-hooks/exhaustive-deps

  // Disegno l'anteprima
  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    const dpr = window.devicePixelRatio || 1
    c.width = VIEW * dpr; c.height = VIEW * dpr
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0E1016'; ctx.fillRect(0, 0, VIEW, VIEW)
    const dw = w * scale, dh = h * scale
    ctx.drawImage(img, VIEW / 2 - dw / 2 + pos.x, VIEW / 2 - dh / 2 + pos.y, dw, dh)
  }, [img, scale, pos, w, h])

  const onDown = e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, p: pos } }
  const onMove = e => { const d = drag.current; if (d) setPos(clamp({ x: d.p.x + e.clientX - d.x, y: d.p.y + e.clientY - d.y })) }
  const onUp = () => { drag.current = null }
  const onWheel = e => setZoom(z => Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.08 : 0.93))))

  const save = async () => {
    const out = document.createElement('canvas')
    out.width = OUT; out.height = OUT
    const ctx = out.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    const k = OUT / VIEW, dw = w * scale * k, dh = h * scale * k
    ctx.drawImage(img, OUT / 2 - dw / 2 + pos.x * k, OUT / 2 - dh / 2 + pos.y * k, dw, dh)
    const toBlob = (type, q) => new Promise(r => out.toBlob(r, type, q))
    let blob = null
    for (const q of [0.82, 0.7, 0.55]) {
      blob = await toBlob('image/webp', q)
      if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', q + 0.05)
      if (blob && blob.size <= MAX_BYTES) break
    }
    if (blob) onDone(blob)
  }

  if (failed) return (
    <div className="account">
      <p className="hint risk__warn">Non riesco ad aprire questa immagine. Prova con una foto JPEG o PNG.</p>
      <button className="btn btn--ghost" onClick={onCancel}>Indietro</button>
    </div>
  )

  return (
    <div className="crop">
      <p className="hint">Trascina per spostare, usa il cursore per ingrandire.</p>
      <div className="crop__frame">
        <canvas ref={canvas} style={{ width: VIEW, height: VIEW }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
          aria-label="Anteprima del ritaglio" />
        <span className="crop__ring" aria-hidden="true" />
      </div>
      <input className="crop__zoom" type="range" min="1" max="4" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Ingrandimento" disabled={!img} />
      <div className="account__confirm">
        <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>Annulla</button>
        <button className="btn btn--ghost crop__ok" onClick={save} disabled={!img || busy}>{busy ? 'Salvo…' : 'Usa questa foto'}</button>
      </div>
      {error && <p className="hint risk__warn">{error}</p>}
    </div>
  )
}

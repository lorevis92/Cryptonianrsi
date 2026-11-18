const P = {
  lock: 'M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z',
  menu: 'M4 7h16 M4 12h16 M4 17h10',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M20 20l-4-4',
  close: 'M6 6l12 12 M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  up: 'M4 17l6-6 4 4 6-7 M14 8h6v6',
  down: 'M4 7l6 6 4-4 6 7 M14 16h6v-6',
  expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  bubbles: 'M3.5 14.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0 M14 7.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0 M16 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  star: 'M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z',
}
export default function Icon({ name, size = 18, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name].split(' M').map((d, i) => <path key={i} d={(i ? 'M' : '') + d} />)}
    </svg>
  )
}

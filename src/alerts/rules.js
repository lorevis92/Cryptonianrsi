// PREDISPOSTO — regole degli avvisi.
// Qui andrà l'algoritmo del Cryptoniano che dice quando entrare.
// Riceve lo stato di tutti i timeframe e restituisce gli eventi da notificare.
//
// states: { [tf]: { K, D, zone, intensity, cross } }
// return: [{ id, symbol, title, body, direction: 'long' | 'short' }]

export function evaluate(symbol, states) {
  void symbol; void states
  return []
}

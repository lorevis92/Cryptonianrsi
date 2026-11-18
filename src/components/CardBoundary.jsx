import { Component } from 'react'

// Se una card si rompe, si spegne solo lei: il resto dell'app continua a funzionare.
export default class CardBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error) { console.error(`[Cryptonian RSI] card ${this.props.tf}:`, error) }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <article className="card" aria-label={`${this.props.tf}, errore`}>
        <header className="card__head"><span className="card__tf">{this.props.tf}</span></header>
        <div className="card__msg">
          <p>Questa card ha avuto un problema.</p>
          <button className="btn btn--ghost card__retry" onClick={() => this.setState({ failed: false })}>Riprova</button>
        </div>
      </article>
    )
  }
}

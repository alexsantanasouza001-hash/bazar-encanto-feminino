import React from 'react'

export class PedidoErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro de renderização capturado no PedidoCompleto:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const pedido = this.props.pedido || {}
      const numero = pedido.numero || pedido.id || ''
      const onVoltarLoja = this.props.onVoltarLoja || (() => { window.location.href = '/' })

      return (
        <div className="checkout-page">
          <header className="checkout-header">
            <button className="checkout-brand" type="button" onClick={onVoltarLoja}>
              <span>✿</span>
              <span>
                <small>Bazar</small>
                <strong>Encanto Feminino</strong>
              </span>
            </button>
          </header>

          <main className="checkout-shell">
            <div className="checkout-card" style={{ maxWidth: '600px', margin: '40px auto', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', color: 'var(--color-primaria, #234B36)', marginBottom: '16px' }}>✓</div>
              <h2 style={{ fontSize: '24px', marginBottom: '12px', color: 'var(--color-texto, #2C2C2C)' }}>Seu pedido foi registrado!</h2>
              {numero && (
                <p style={{ fontSize: '18px', marginBottom: '16px' }}>
                  Número do pedido: <strong style={{ color: 'var(--color-primaria, #234B36)' }}>{numero}</strong>
                </p>
              )}
              <p style={{ color: '#666', marginBottom: '24px', lineHeight: '1.5' }}>
                Houve uma indisponibilidade temporária na exibição dos detalhes finais, mas seu pedido foi registrado no sistema com sucesso.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                {numero && (
                  <button
                    type="button"
                    className="checkout-primary-button"
                    style={{ width: '100%', maxWidth: '300px', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer' }}
                    onClick={() => {
                      window.location.href = `/acompanhar-pedido?pedido=${encodeURIComponent(numero)}`
                    }}
                  >
                    Acompanhar pedido
                  </button>
                )}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--color-primaria, #234B36)', textDecoration: 'underline', cursor: 'pointer', padding: '8px' }}
                  onClick={onVoltarLoja}
                >
                  Voltar para a loja
                </button>
              </div>
            </div>
          </main>
        </div>
      )
    }

    return this.props.children
  }
}

export default PedidoErrorBoundary

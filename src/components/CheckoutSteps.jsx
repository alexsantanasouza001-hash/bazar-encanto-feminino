const ETAPAS = [
  'Carrinho de Compras',
  'Detalhes da Compra',
  'Pedido Completo'
]

function CheckoutSteps({ etapaAtual }) {
  return (
    <ol
      className="checkout-steps"
      aria-label="Etapas da compra"
    >
      {ETAPAS.map((etapa, indice) => (
        <li
          className={
            indice < etapaAtual
              ? 'completed'
              : indice === etapaAtual
                ? 'active'
                : ''
          }
          key={etapa}
        >
          <span>{indice + 1}</span>
          <strong>{etapa}</strong>
        </li>
      ))}
    </ol>
  )
}

export default CheckoutSteps

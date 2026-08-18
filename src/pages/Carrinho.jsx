import CheckoutSteps from '../components/CheckoutSteps'
import {
  calcularIncentivoFreteGratis,
  LIMITE_FRETE_GRATIS
} from './checkoutShipping'
import './Checkout.css'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function obterFoto(item) {
  if (item.foto) {
    return item.foto
  }

  const primeiraFoto = Array.isArray(item.fotos)
    ? item.fotos[0]
    : null

  return typeof primeiraFoto === 'string'
    ? primeiraFoto
    : primeiraFoto?.foto || ''
}

function Carrinho({
  itens,
  subtotal,
  desconto,
  codigoCupom,
  cupomAplicado,
  mensagemCupom,
  onCodigoCupomChange,
  onAplicarCupom,
  onRemoverCupom,
  onVoltar,
  onContinuar,
  onAumentar,
  onDiminuir,
  onRemover
}) {
  const baseCalculo = Math.max(0, Number(subtotal || 0) - Number(desconto || 0))
  const valorParaFreteGratis = calcularIncentivoFreteGratis(baseCalculo)
  const temFreteGratis = baseCalculo >= LIMITE_FRETE_GRATIS
  const totalCarrinho = baseCalculo

  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <button
          className="checkout-brand"
          type="button"
          onClick={onVoltar}
        >
          <span>✿</span>
          <span>
            <small>Bazar</small>
            <strong>Encanto Feminino</strong>
          </span>
        </button>
      </header>

      <main className="checkout-shell">
        <CheckoutSteps etapaAtual={0} />

        <div className="checkout-title">
          <span>SEU PEDIDO</span>
          <h1>Carrinho de compras</h1>
          <p>Revise suas escolhas antes de continuar.</p>
        </div>

        {itens.length === 0 ? (
          <section className="checkout-empty">
            <div aria-hidden="true">◇</div>
            <h2>Seu carrinho está vazio</h2>
            <p>Escolha uma peça especial para iniciar seu pedido.</p>
            <button type="button" onClick={onVoltar}>
              Voltar para a loja
            </button>
          </section>
        ) : (
          <div className="checkout-grid">
            <section className="checkout-card checkout-cart-list">
              <div className="checkout-card-heading">
                <h2>Produtos selecionados</h2>
                <span>{itens.length} item(ns)</span>
              </div>

              {itens.map((item) => {
                const foto = obterFoto(item)
                const preco = Number(item.venda || 0)
                const quantidade = Number(item.quantidade || 0)

                return (
                  <article
                    className="checkout-cart-item"
                    key={item.cor ? `${item.id}-${item.cor}-${item.tamanho}` : `${item.id}-${item.tamanho}`}
                  >
                    <div className="checkout-item-image">
                      {foto ? (
                        <img src={foto} alt={item.nome} />
                      ) : (
                        <span aria-hidden="true">✿</span>
                      )}
                    </div>

                    <div className="checkout-item-info">
                      <span>{item.marca || 'Encanto Feminino'}</span>
                      <h3>{item.nome}</h3>
                      <p>
                        {item.cor && item.cor !== 'Única' && (
                          <>Cor: <strong>{item.cor}</strong> &bull; </>
                        )}
                        {item.tamanho && <>Tamanho: <strong>{item.tamanho}</strong></>}
                      </p>
                      <small>{formatarPreco(preco)} cada</small>
                    </div>

                    <div className="checkout-item-actions">
                      <div className="checkout-quantity" aria-label="Quantidade">
                        <button
                          type="button"
                          onClick={() => onDiminuir(item.id, item.cor, item.tamanho)}
                          aria-label={`Diminuir quantidade de ${item.nome}`}
                        >
                          −
                        </button>
                        <span>{quantidade}</span>
                        <button
                          type="button"
                          onClick={() => onAumentar(item.id, item.cor, item.tamanho)}
                          aria-label={`Aumentar quantidade de ${item.nome}`}
                        >
                          +
                        </button>
                      </div>

                      <strong>{formatarPreco(preco * quantidade)}</strong>

                      <button
                        className="checkout-item-remove"
                        type="button"
                        onClick={() => onRemover(item.id, item.cor, item.tamanho)}
                        aria-label={`Remover ${item.nome}`}
                      >
                        Remover
                      </button>
                    </div>
                  </article>
                )
              })}

              <button
                className="checkout-back-link"
                type="button"
                onClick={onVoltar}
              >
                ← Continuar comprando
              </button>
            </section>

            <aside className="checkout-card checkout-summary">
              <h2>Resumo do pedido</h2>

              <div className="checkout-summary-row">
                <span>Subtotal</span>
                <strong>{formatarPreco(subtotal)}</strong>
              </div>
              <div className="checkout-summary-row">
                <span>Cupom / Desconto</span>
                <strong className={desconto > 0 ? 'checkout-discount-value' : ''}>
                  {desconto > 0 ? '−' : ''}{formatarPreco(desconto)}
                </strong>
              </div>

              <div className={`checkout-free-shipping ${temFreteGratis ? 'gratis' : ''}`}>
                {temFreteGratis
                  ? '✓ Você ganhou FRETE GRÁTIS!'
                  : `Faltam ${formatarPreco(valorParaFreteGratis)} para você ganhar FRETE GRÁTIS.`}
              </div>

              <div className="checkout-summary-total">
                <span>Total</span>
                <strong>{formatarPreco(totalCarrinho)}</strong>
              </div>

              <div className="checkout-coupon">
                <label htmlFor="codigo-cupom">
                  Cupom de desconto
                </label>

                <div className="checkout-coupon-form">
                  <input
                    id="codigo-cupom"
                    value={codigoCupom}
                    onChange={(evento) =>
                      onCodigoCupomChange(
                        evento.target.value.toUpperCase()
                      )
                    }
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') {
                        evento.preventDefault()
                        onAplicarCupom()
                      }
                    }}
                    placeholder="Digite o código do cupom"
                    disabled={Boolean(cupomAplicado)}
                  />
                  <button
                    type="button"
                    onClick={onAplicarCupom}
                    disabled={Boolean(cupomAplicado)}
                  >
                    Aplicar
                  </button>
                </div>

                {mensagemCupom && (
                  <p
                    className={`checkout-coupon-message ${mensagemCupom.tipo}`}
                    role="status"
                  >
                    {mensagemCupom.texto}
                  </p>
                )}

                {cupomAplicado && (
                  <div className="checkout-coupon-applied">
                    <span>
                      {cupomAplicado.codigo}
                    </span>
                    <button
                      type="button"
                      onClick={onRemoverCupom}
                    >
                      Remover cupom
                    </button>
                  </div>
                )}
              </div>

              <button
                className="checkout-primary-button"
                type="button"
                onClick={onContinuar}
              >
                Avançar para entrega
              </button>

              <p className="checkout-secure-note">
                O cálculo de frete e opções de entrega serão preenchidos na próxima etapa.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

export default Carrinho

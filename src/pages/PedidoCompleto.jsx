import { useEffect, useState } from 'react'
import CheckoutSteps from '../components/CheckoutSteps'
import { consultarPagamento } from '../storage'
import { obterStatusPagamento } from './statusHelpers'
import './Checkout.css'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatarData(data) {
  return new Date(data).toLocaleString('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short'
  })
}

function PedidoCompleto({
  pedido,
  onVoltarLoja,
  onWhatsApp
}) {
  const [pedidoPagamento, setPedidoPagamento] = useState(pedido)
  const [pagamento, setPagamento] = useState(pedido.pagamento || null)
  const [consultando, setConsultando] = useState(false)
  const [mensagemPagamento, setMensagemPagamento] = useState('')
  const dados = pedido.dadosCliente || {}
  const valorFrete = Number(
    pedido.valor_frete ??
    pedido.entrega ??
    0
  )
  const cepEntrega =
    pedido.cep_entrega ||
    dados.cep ||
    ''
  const endereco = [
    pedido.endereco_entrega || dados.endereco,
    pedido.numero_entrega || dados.numero,
    pedido.complemento_entrega || dados.complemento,
    pedido.bairro_entrega || dados.bairro,
    `${pedido.cidade_entrega || dados.cidade || ''}${
      pedido.estado_entrega || dados.estado
        ? ` - ${pedido.estado_entrega || dados.estado}`
        : ''
    }`
  ].filter(Boolean).join(', ')
  const formaPagamento =
    pedidoPagamento.forma_pagamento ||
    pedido.formaPagamento ||
    ''
  const {
    aprovado: pagamentoAprovado,
    pendente: pagamentoPendente,
    titulo: tituloPagamento,
    resumo: resumoPagamento
  } = obterStatusPagamento(
    pedidoPagamento.status_pagamento
  )
  const reservaAtiva =
    pagamentoPendente &&
    pedidoPagamento.reserva_status ===
      'reservado'
  const pixPendente =
    formaPagamento === 'Pix' &&
    pagamentoPendente

  useEffect(() => {
    if (!pagamentoPendente) return

    let ativo = true
    const intervalo = setInterval(async () => {
      if (!ativo || consultando) return

      const token =
        pedidoPagamento?.pagamento_consulta_token ||
        pedido?.pagamento_consulta_token ||
        pedidoPagamento?.consulta_token ||
        pedido?.consulta_token

      const num = pedidoPagamento?.numero || pedido?.numero
      if (!num || !token) return

      try {
        const resultado = await consultarPagamento({
          numero: num,
          consultaToken: token
        })

        if (!ativo || !resultado?.sucesso || !resultado?.pedido) return

        const novoStatus = obterStatusPagamento(resultado.pedido.status_pagamento)
        if (novoStatus.aprovado || resultado.pedido.status_pagamento !== pedidoPagamento.status_pagamento) {
          setPedidoPagamento((atual) => ({
            ...atual,
            ...resultado.pedido
          }))
          if (resultado.pagamento) {
            setPagamento(resultado.pagamento)
          }
        }
      } catch (err) {
        console.error('Erro no polling de pagamento:', err)
      }
    }, 4000)

    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [
    pagamentoPendente,
    pedidoPagamento?.status_pagamento,
    pedidoPagamento?.numero,
    pedidoPagamento?.pagamento_consulta_token,
    pedidoPagamento?.consulta_token,
    pedido?.numero,
    pedido?.pagamento_consulta_token,
    pedido?.consulta_token,
    consultando
  ])

  const copiarPix = async () => {
    if (!pagamento?.qr_code) return

    try {
      await navigator.clipboard.writeText(pagamento.qr_code)
      setMensagemPagamento('Código Pix copiado.')
    } catch {
      setMensagemPagamento('Não foi possível copiar automaticamente.')
    }
  }

  const atualizarPagamento = async () => {
    setConsultando(true)
    setMensagemPagamento('')

    const token =
      pedidoPagamento?.pagamento_consulta_token ||
      pedido?.pagamento_consulta_token ||
      pedidoPagamento?.consulta_token ||
      pedido?.consulta_token

    const num = pedidoPagamento?.numero || pedido?.numero

    const resultado = await consultarPagamento({
      numero: num,
      consultaToken: token
    })

    setConsultando(false)

    if (!resultado.sucesso) {
      setMensagemPagamento(resultado.mensagem)
      return
    }

    setPedidoPagamento((atual) => ({
      ...atual,
      ...resultado.pedido
    }))
    if (resultado.pagamento) {
      setPagamento(resultado.pagamento)
    }
    setMensagemPagamento(
      obterStatusPagamento(
        resultado.pedido.status_pagamento
      ).mensagemAtualizacao
    )
  }

  const acompanharPedido = () => {
    const numero = pedidoPagamento.numero || pedidoPagamento.id || ''
    window.location.href = `/acompanhar-pedido?pedido=${encodeURIComponent(numero)}`
  }

  return (
    <div className="checkout-page">
      <header className="checkout-header">
        <button
          className="checkout-brand"
          type="button"
          onClick={onVoltarLoja}
        >
          <span>✿</span>
          <span>
            <small>Bazar</small>
            <strong>Encanto Feminino</strong>
          </span>
        </button>
      </header>

      <main className="checkout-shell">
        <CheckoutSteps etapaAtual={2} />

        <section className="checkout-success">
          <div className="checkout-success-icon" aria-hidden="true">✓</div>
          <span>{pagamentoAprovado ? 'PAGAMENTO CONFIRMADO' : 'PEDIDO REALIZADO'}</span>
          <h1>{tituloPagamento}</h1>
          <p>
            Obrigada, {dados.nome}. Seu pedido foi registrado.
            {reservaAtiva &&
              ' O estoque ficará reservado durante o prazo informado para pagamento.'}
          </p>
        </section>

        <div className="checkout-complete-grid">
          <section className="checkout-card checkout-order-details">
            <div className="checkout-order-number">
              <div>
                <span>NÚMERO DO PEDIDO</span>
                <strong>{pedido.numero}</strong>
              </div>
              <div id="pedido-status">
                <span>STATUS</span>
                <strong>{pedidoPagamento.status || 'Status não informado'}</strong>
              </div>
            </div>

            <dl className="checkout-customer-details">
              <div>
                <dt>Cliente</dt>
                <dd>{pedido.nomeCliente || pedido.cliente}</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>{formatarData(pedido.data)}</dd>
              </div>
              <div>
                <dt>Forma de pagamento</dt>
                <dd>{formaPagamento}</dd>
              </div>
              <div>
                <dt>Endereço de entrega</dt>
                <dd>{endereco}</dd>
              </div>
              <div>
                <dt>CEP</dt>
                <dd>{cepEntrega}</dd>
              </div>
              {(pedidoPagamento.transportadora || pedidoPagamento.codigo_rastreio) && (
                <div>
                  <dt>Rastreamento</dt>
                  <dd>
                    {[pedidoPagamento.transportadora, pedidoPagamento.codigo_rastreio]
                      .filter(Boolean)
                      .join(' — ')}
                    {pedidoPagamento.url_rastreio && (
                      <>{' '}<a href={pedidoPagamento.url_rastreio} target="_blank" rel="noreferrer">Acompanhar entrega</a></>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            <div className="checkout-complete-items">
              <h2>Produtos</h2>
              {pedido.itens.map((item) => (
                <article key={`${item.produtoId || item.id}-${item.tamanho}`}>
                  <div>
                    <strong>{item.nome}</strong>
                    <span>
                      Tamanho {item.tamanho} · Quantidade {item.quantidade}
                    </span>
                  </div>
                  <strong>{formatarPreco(item.subtotal)}</strong>
                </article>
              ))}
            </div>
          </section>

          <aside className="checkout-card checkout-summary">
            <h2>Resumo do pedido</h2>

            {pixPendente && pagamento?.qr_code && (
              <section className="checkout-pix-payment" aria-live="polite">
                <span>PIX</span>
                <h3>Aguardando pagamento</h3>
                {pagamento.qr_code_base64 && (
                  <img
                    src={`data:image/png;base64,${pagamento.qr_code_base64}`}
                    alt="QR Code Pix para pagamento"
                  />
                )}
                <label>
                  Pix copia e cola
                  <textarea readOnly value={pagamento.qr_code} rows="4" />
                </label>
                <button type="button" onClick={copiarPix}>
                  Copiar Pix
                </button>
                {pagamento.expiracao && (
                  <small>Válido até {formatarData(pagamento.expiracao)}</small>
                )}
              </section>
            )}

            <div className="checkout-payment-status">
              <span>Pagamento</span>
              <strong>{resumoPagamento}</strong>
            </div>
            <div className="checkout-summary-row">
              <span>Subtotal</span>
              <strong>{formatarPreco(pedido.subtotal)}</strong>
            </div>
            <div className="checkout-summary-row">
              <span>Cupom / Desconto</span>
              <strong className={pedido.desconto > 0 ? 'checkout-discount-value' : ''}>
                {pedido.desconto > 0 ? '−' : ''}{formatarPreco(pedido.desconto)}
              </strong>
            </div>
            <div className="checkout-summary-row">
              <span>Envio</span>
              <strong>
                {valorFrete === 0
                  ? 'GRÁTIS'
                  : formatarPreco(valorFrete)}
              </strong>
            </div>
            <div className="checkout-shipping-description">
              {valorFrete === 0
                ? 'Frete grátis'
                : `Frete padrão — ${formatarPreco(valorFrete)}`}
            </div>
            <div className="checkout-summary-total">
              <span>Total</span>
              <strong>{formatarPreco(pedido.total)}</strong>
            </div>

            {pedido.cupom && (
              <div className="checkout-coupon-checkout">
                <span>Cupom utilizado</span>
                <strong>{pedido.cupom}</strong>
              </div>
            )}

            <div className="checkout-complete-actions">
              {pagamentoPendente && (
                <button
                  type="button"
                  onClick={atualizarPagamento}
                  disabled={consultando}
                >
                  {consultando ? 'Atualizando...' : 'Já paguei / Atualizar pagamento'}
                </button>
              )}
              {mensagemPagamento && (
                <p className="checkout-payment-message" role="status">
                  {mensagemPagamento}
                </p>
              )}
              <button type="button" onClick={acompanharPedido}>
                Acompanhar pedido
              </button>
              <button type="button" onClick={onVoltarLoja}>
                Voltar para a loja
              </button>
              <button
                className="checkout-whatsapp-button"
                type="button"
                onClick={onWhatsApp}
              >
                Falar no WhatsApp
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default PedidoCompleto

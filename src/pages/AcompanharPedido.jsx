import { useEffect, useRef, useState } from 'react'
import { consultarPedidoPublico } from '../storage'
import { montarTimelinePedido, obterStatusPagamento, obterStatusPedido } from './statusHelpers'
import './AcompanharPedido.css'

const STORAGE_KEY = 'bazar_acompanhar_pedido_sessao'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL'
  })
}

function formatarData(valor) {
  if (!valor) return 'Não informado'
  const data = new Date(valor)
  return Number.isNaN(data.getTime())
    ? 'Não informado'
    : data.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
}

function AcompanharPedido({ onNavegar }) {
  const parametros = new URLSearchParams(window.location.search)
  const [numero, setNumero] = useState(parametros.get('pedido') || '')
  const [email, setEmail] = useState('')
  const [pedido, setPedido] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [consultando, setConsultando] = useState(false)
  const autoRestauradoRef = useRef(false)

  const irParaLoja = (evento) => {
    if (evento) evento.preventDefault()
    if (onNavegar) {
      onNavegar('/')
    } else {
      window.location.href = '/'
    }
  }

  const executarConsulta = async (numConsulta, emailConsulta, salvarSessao = true) => {
    setConsultando(true)
    setMensagem('')
    setPedido(null)

    const resultado = await consultarPedidoPublico({
      numero: numConsulta,
      email: emailConsulta
    })

    setConsultando(false)

    if (!resultado.sucesso) {
      if (salvarSessao) {
        try {
          sessionStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
      }
      setMensagem(resultado.mensagem)
      return
    }

    if (salvarSessao) {
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            numero: String(numConsulta || '').trim().toUpperCase(),
            email: String(emailConsulta || '').trim().toLowerCase()
          })
        )
      } catch {
        // ignore
      }
    }

    setPedido(resultado.pedido)
  }

  useEffect(() => {
    if (autoRestauradoRef.current) return
    autoRestauradoRef.current = true

    try {
      const salvoRaw = sessionStorage.getItem(STORAGE_KEY)
      if (salvoRaw) {
        const salvo = JSON.parse(salvoRaw)
        if (salvo?.numero && salvo?.email) {
          setNumero(salvo.numero)
          setEmail(salvo.email)
          executarConsulta(salvo.numero, salvo.email, false)
        }
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const consultar = async (evento) => {
    evento.preventDefault()
    await executarConsulta(numero, email, true)
  }

  const consultarOutroPedido = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setPedido(null)
    setMensagem('')
    setNumero('')
    setEmail('')
  }

  const statusPagamento = pedido
    ? obterStatusPagamento(pedido.status_pagamento)
    : null
  const timeline = pedido
    ? montarTimelinePedido(pedido.status, pedido.status_pagamento)
    : []

  return (
    <div className="tracking-page">
      <header className="tracking-header">
        <button type="button" onClick={irParaLoja}>
          <span aria-hidden="true">✿</span>
          <span><small>Bazar</small><strong>Encanto Feminino</strong></span>
        </button>
      </header>

      <main className="tracking-shell">
        <section className="tracking-intro">
          <span>ACOMPANHE SUA COMPRA</span>
          <h1>Acompanhar pedido</h1>
          <p>Informe o número do pedido e o mesmo e-mail utilizado na compra.</p>
        </section>

        {!pedido && (
          <form className="tracking-form" onSubmit={consultar} aria-describedby="tracking-message">
            <label htmlFor="tracking-number">Número do pedido</label>
            <input
              id="tracking-number"
              value={numero}
              onChange={(evento) => setNumero(evento.target.value.toUpperCase())}
              placeholder="PED-000000"
              autoComplete="off"
              maxLength="24"
              required
            />
            <label htmlFor="tracking-email">E-mail da compra</label>
            <input
              id="tracking-email"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              autoComplete="email"
              required
            />
            <button type="submit" disabled={consultando}>
              {consultando ? 'Consultando...' : 'Acompanhar pedido'}
            </button>
            <p id="tracking-message" className="tracking-message" role="status" aria-live="polite">
              {mensagem}
            </p>
          </form>
        )}

        {pedido && (
          <section className="tracking-result" aria-live="polite">
            <div className="tracking-summary">
              <div><span>Pedido</span><strong>{pedido.numero}</strong></div>
              <div><span>Status</span><strong>{obterStatusPedido(pedido.status)}</strong></div>
              <div><span>Pagamento</span><strong>{statusPagamento.resumo}</strong></div>
              <div><span>Atualizado</span><strong>{formatarData(pedido.atualizado_em || pedido.data)}</strong></div>
            </div>

            <ol className="tracking-timeline" aria-label="Andamento do pedido">
              {timeline.map((etapa) => (
                <li className={etapa.estado} key={etapa.titulo}>
                  <span aria-hidden="true">{(etapa.estado === 'concluido' || etapa.estado === 'atual') ? '✓' : '•'}</span>
                  <strong>{etapa.titulo}</strong>
                </li>
              ))}
            </ol>

            {(pedido.codigo_rastreio || pedido.transportadora) && (
              <div className="tracking-shipping">
                <span>RASTREAMENTO</span>
                {pedido.transportadora && <strong>{pedido.transportadora}</strong>}
                {pedido.codigo_rastreio && <code>{pedido.codigo_rastreio}</code>}
                {pedido.url_rastreio && (
                  <a href={pedido.url_rastreio} target="_blank" rel="noreferrer">
                    Abrir rastreamento
                  </a>
                )}
              </div>
            )}

            <div className="tracking-items">
              <h2>Itens do pedido</h2>
              {pedido.itens.map((item, indice) => (
                <article key={`${item.nome}-${item.tamanho}-${indice}`}>
                  <div><strong>{item.nome}</strong><span>Tamanho {item.tamanho || '—'} · {item.quantidade} un.</span></div>
                  <strong>{formatarPreco(item.subtotal)}</strong>
                </article>
              ))}
            </div>

            <div className="tracking-totals">
              <span>Envio</span><strong>{Number(pedido.valor_frete) === 0 ? 'GRÁTIS' : formatarPreco(pedido.valor_frete)}</strong>
              <span>Total</span><strong>{formatarPreco(pedido.total)}</strong>
            </div>
            {(pedido.cidade_entrega || pedido.estado_entrega) && (
              <p className="tracking-destination">
                Destino: {[pedido.cidade_entrega, pedido.estado_entrega].filter(Boolean).join(' — ')}
              </p>
            )}

            <div className="tracking-actions">
              <button
                type="button"
                className="tracking-another-button"
                onClick={consultarOutroPedido}
              >
                Consultar outro pedido
              </button>
              <a
                className="tracking-whatsapp"
                href="/"
                onClick={irParaLoja}
              >
                Voltar para a loja
              </a>
            </div>
          </section>
        )}

        {!pedido && (
          <a className="tracking-whatsapp" href="/" onClick={irParaLoja}>
            Voltar para a loja
          </a>
        )}
      </main>
    </div>
  )
}

export default AcompanharPedido

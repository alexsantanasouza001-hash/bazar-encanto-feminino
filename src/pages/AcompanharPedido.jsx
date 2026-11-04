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
  const [codigo, setCodigo] = useState(parametros.get('codigo') || parametros.get('pedido') || '')
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

  const executarConsulta = async (codConsulta, salvarSessao = true) => {
    setConsultando(true)
    setMensagem('')
    setPedido(null)

    const codNormalizado = String(codConsulta || '').trim().toUpperCase()

    const resultado = await consultarPedidoPublico({
      codigo: codNormalizado,
      numero: codNormalizado
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
      setMensagem(resultado.mensagem || 'Código de pedido não encontrado.')
      return
    }

    if (salvarSessao) {
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            codigo: codNormalizado
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
      const searchParams = new URLSearchParams(window.location.search)
      const paramUrl = searchParams.get('codigo') || searchParams.get('pedido')
      if (paramUrl) {
        setCodigo(paramUrl)
        executarConsulta(paramUrl, true)
        return
      }

      const salvoRaw = sessionStorage.getItem(STORAGE_KEY)
      if (salvoRaw) {
        const salvo = JSON.parse(salvoRaw)
        if (salvo?.codigo) {
          setCodigo(salvo.codigo)
          executarConsulta(salvo.codigo, false)
        }
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const consultar = async (evento) => {
    evento.preventDefault()
    await executarConsulta(codigo, true)
  }

  const consultarOutroPedido = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setPedido(null)
    setMensagem('')
    setCodigo('')
  }

  const statusPagamento = pedido
    ? obterStatusPagamento(pedido.status_pagamento)
    : null
  const timeline = pedido
    ? montarTimelinePedido(pedido.status, pedido.status_pagamento, pedido.modalidade_entrega)
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
          <p>Informe o código seguro do pedido recebido na confirmação da compra.</p>
        </section>

        {!pedido && (
          <form className="tracking-form" onSubmit={consultar} aria-describedby="tracking-message">
            <label htmlFor="tracking-code">Código do pedido</label>
            <input
              id="tracking-code"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
              placeholder="Ex: ENC-7K4P9X2D"
              autoComplete="off"
              maxLength="32"
              required
            />
            <button type="submit" disabled={consultando}>
              {consultando ? 'Consultando...' : 'Consultar pedido'}
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
                {pedido.codigo_rastreio && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <code>{pedido.codigo_rastreio}</code>
                    <button
                      type="button"
                      className="tracking-btn-copiar"
                      onClick={() => {
                        navigator.clipboard.writeText(pedido.codigo_rastreio)
                        alert('Código de rastreio copiado!')
                      }}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      📋 Copiar Código
                    </button>
                  </div>
                )}
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
                  <div>
                    <strong>{item.nome}</strong>
                    <span>
                      {item.cor && item.cor !== 'Única' ? `Cor: ${item.cor} · ` : ''}
                      Tamanho {item.tamanho || '—'} · {item.quantidade} un.
                    </span>
                  </div>
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

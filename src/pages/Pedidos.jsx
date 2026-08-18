import { useEffect, useState } from 'react'
import './Pedidos.css'

import {
  carregarPedidos as carregarPedidosSupabase,
  atualizarStatusPedido,
  removerPedido
} from '../storage'
import {
  obterStatusPedido as obterStatus,
  obterTransicoesPedido,
  ehPedidoDeTeste
} from './statusHelpers'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  )
}

function formatarData(data) {
  if (!data) return '--'
  const dataPedido = new Date(data)
  if (Number.isNaN(dataPedido.getTime())) return '--'
  return dataPedido.toLocaleDateString('pt-BR')
}

function formatarHora(data) {
  if (!data) return '--'
  const dataPedido = new Date(data)
  if (Number.isNaN(dataPedido.getTime())) return '--'
  return dataPedido.toLocaleTimeString(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  )
}

function obterProdutos(pedido) {
  if (Array.isArray(pedido.produtos)) return pedido.produtos
  if (Array.isArray(pedido.itens)) return pedido.itens
  if (Array.isArray(pedido.carrinho)) return pedido.carrinho
  return []
}

function obterNomeCliente(pedido) {
  return (
    pedido.nomeCliente ||
    pedido.cliente ||
    pedido.nome ||
    'Cliente não informada'
  )
}

function obterDataPedido(pedido) {
  return (
    pedido.data ||
    pedido.dataPedido ||
    pedido.createdAt ||
    pedido.criadoEm ||
    null
  )
}

function obterNumeroPedido(pedido, indice) {
  if (pedido.numero) return pedido.numero
  if (pedido.id) return String(pedido.id).slice(-6)
  return String(indice + 1).padStart(4, '0')
}

function obterTotal(pedido, produtos) {
  if (pedido.total !== undefined && pedido.total !== null) {
    return Number(pedido.total || 0)
  }
  if (pedido.valorTotal !== undefined && pedido.valorTotal !== null) {
    return Number(pedido.valorTotal || 0)
  }

  return produtos.reduce((total, produto) => {
    const quantidade = Number(produto.quantidade || 1)
    const preco = Number(produto.preco ?? produto.venda ?? produto.valor ?? 0)
    return total + preco * quantidade
  }, 0)
}

function obterClasseStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('confirmado') || s.includes('pago')) return 'confirmado'
  if (s.includes('aguardando')) return 'aguardando'
  if (s.includes('preparação') || s.includes('preparacao')) return 'preparacao'
  if (s.includes('enviado')) return 'enviado'
  if (s.includes('entregue') || s.includes('concluído') || s.includes('concluido')) return 'entregue'
  if (s.includes('cancelado')) return 'cancelado'
  return 'confirmado'
}

function Pedidos() {
  const [pedidos, setPedidos] = useState([])
  const [envioPorPedido, setEnvioPorPedido] = useState({})
  const [atualizandoPedido, setAtualizandoPedido] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [pedidosExpandidos, setPedidosExpandidos] = useState({})

  useEffect(() => {
    let ativo = true

    async function atualizarPedidos() {
      try {
        const pedidosSupabase = await carregarPedidosSupabase()
        if (!ativo) return
        setPedidos(Array.isArray(pedidosSupabase) ? pedidosSupabase : [])
      } catch (erro) {
        console.error('Erro ao carregar pedidos do Supabase:', erro)
        if (ativo) setPedidos([])
      }
    }

    atualizarPedidos()

    return () => {
      ativo = false
    }
  }, [])

  const toggleExpandir = (id) => {
    setPedidosExpandidos((prev) => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const alterarStatus = (pedido, novoStatus, dadosEnvio = {}) => {
    if (!pedido?.id || obterStatus(pedido?.status) === novoStatus) return

    async function atualizarStatus() {
      try {
        if (
          novoStatus === 'Cancelado' &&
          !window.confirm('Confirma o cancelamento deste pedido? Pagamentos aprovados não serão reembolsados automaticamente.')
        ) {
          return
        }

        setAtualizandoPedido(pedido.id)
        const pedidosAtualizados = await atualizarStatusPedido(
          pedido.id,
          novoStatus,
          dadosEnvio
        )

        if (!Array.isArray(pedidosAtualizados)) {
          throw new Error('A atualização não retornou os pedidos.')
        }

        setPedidos(pedidosAtualizados)
        setEnvioPorPedido((atual) => ({ ...atual, [pedido.id]: undefined }))
      } catch (erro) {
        console.error('Erro ao atualizar status do pedido:', erro)
        window.alert('Não foi possível atualizar o status do pedido.')
      } finally {
        setAtualizandoPedido(null)
      }
    }

    atualizarStatus()
  }

  const handleRemoverPedidoTeste = async (pedido) => {
    if (!ehPedidoDeTeste(pedido)) {
      window.alert('Este pedido é um pedido real de cliente em produção e não pode ser removido.')
      return
    }

    const confirmou = window.confirm(
      `Confirma a remoção do pedido de teste #${obterNumeroPedido(pedido, 0)} (${obterNomeCliente(pedido)})?\n\nOs pedidos reais de clientes em produção permanecerão 100% seguros.`
    )
    if (!confirmou) return

    try {
      setAtualizandoPedido(pedido.id)
      const pedidosAtualizados = await removerPedido(pedido.id)
      setPedidos(Array.isArray(pedidosAtualizados) ? pedidosAtualizados : [])
    } catch (erro) {
      console.error('Erro ao remover pedido de teste:', erro)
      window.alert('Não foi possível remover o pedido de teste.')
    } finally {
      setAtualizandoPedido(null)
    }
  }

  const handleLimparTodosTestes = async () => {
    const testes = pedidos.filter(ehPedidoDeTeste)
    if (testes.length === 0) {
      window.alert('Nenhum pedido de teste identificado.')
      return
    }

    const confirmou = window.confirm(
      `Deseja realmente limpar ${testes.length} pedido(s) comprovadamente de teste?\n\nCritérios: e-mails de teste, nomes de teste e referências de diagnóstico.\n\nTodos os pedidos reais de clientes serão 100% mantidos intactos.`
    )
    if (!confirmou) return

    try {
      setAtualizandoPedido('limpeza-massa')
      for (const p of testes) {
        await removerPedido(p.id)
      }
      const pedidosAtualizados = await carregarPedidosSupabase()
      setPedidos(Array.isArray(pedidosAtualizados) ? pedidosAtualizados : [])
      window.alert(`Limpeza concluída! ${testes.length} pedidos de teste foram removidos.`)
    } catch (erro) {
      console.error('Erro na limpeza de pedidos de teste:', erro)
      window.alert('Erro ao limpar pedidos de teste.')
    } finally {
      setAtualizandoPedido(null)
    }
  }

  const pedidosTestes = pedidos.filter(ehPedidoDeTeste)
  const pedidosReais = pedidos.filter((p) => !ehPedidoDeTeste(p))

  const pedidosFiltrados = pedidos.filter((pedido) => {
    if (filtroTipo === 'reais') return !ehPedidoDeTeste(pedido)
    if (filtroTipo === 'testes') return ehPedidoDeTeste(pedido)
    return true
  })

  const pedidosHoje = pedidosReais.filter((pedido) => {
    const data = obterDataPedido(pedido)
    if (!data) return false
    const dataPedido = new Date(data)
    const hoje = new Date()
    return (
      dataPedido.getDate() === hoje.getDate() &&
      dataPedido.getMonth() === hoje.getMonth() &&
      dataPedido.getFullYear() === hoje.getFullYear()
    )
  }).length

  const pedidosConfirmados = pedidosReais.filter(
    (pedido) => obterStatus(pedido.status) === 'Confirmado'
  ).length

  const valorTotalPedidos = pedidosReais.reduce((total, pedido) => {
    const produtos = obterProdutos(pedido)
    return total + obterTotal(pedido, produtos)
  }, 0)

  return (
    <div className="pedidos-page">
      {/* CABEÇALHO */}
      <div className="pedidos-header">
        <span className="pedidos-eyebrow">BAZAR ENCANTO FEMININO</span>
        <h1>Pedidos</h1>
        <p>Acompanhamento operacional rápido dos pedidos realizados pelas clientes.</p>
      </div>

      {/* CARDS INDICADORES */}
      <div className="pedidos-cards">
        <div className="pedido-card">
          <div className="pedido-card-icon">🛍️</div>
          <div>
            <span>Pedidos hoje</span>
            <strong>{pedidosHoje} un.</strong>
          </div>
        </div>

        <div className="pedido-card">
          <div className="pedido-card-icon">✓</div>
          <div>
            <span>Confirmados / Pagos</span>
            <strong>{pedidosConfirmados} un.</strong>
          </div>
        </div>

        <div className="pedido-card">
          <div className="pedido-card-icon">💰</div>
          <div>
            <span>Faturamento real</span>
            <strong>{formatarPreco(valorTotalPedidos)}</strong>
          </div>
        </div>
      </div>

      {/* PAINEL DE PEDIDOS */}
      <div className="pedidos-panel">
        <div className="pedidos-panel-header">
          <div>
            <h2>Histórico de vendas</h2>
            <p>Lista operacional compacta com transições rápidas de status</p>
          </div>

          <div className="pedidos-total-label">
            {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* BARRA DE FILTROS */}
        <div className="pedidos-filtros-container">
          <div className="pedidos-filtros-tabs">
            <button
              type="button"
              className={`pedidos-filtro-tab ${filtroTipo === 'todos' ? 'ativo' : ''}`}
              onClick={() => setFiltroTipo('todos')}
            >
              Todos ({pedidos.length})
            </button>
            <button
              type="button"
              className={`pedidos-filtro-tab ${filtroTipo === 'reais' ? 'ativo' : ''}`}
              onClick={() => setFiltroTipo('reais')}
            >
              Reais / Produção ({pedidosReais.length})
            </button>
            <button
              type="button"
              className={`pedidos-filtro-tab ${filtroTipo === 'testes' ? 'ativo' : ''}`}
              onClick={() => setFiltroTipo('testes')}
            >
              Testes / Homologação ({pedidosTestes.length})
            </button>
          </div>

          {pedidosTestes.length > 0 && (
            <button
              type="button"
              className="btn-limpar-testes-topo"
              disabled={Boolean(atualizandoPedido)}
              onClick={handleLimparTodosTestes}
              title="Executar limpeza somente dos pedidos de teste identificados"
            >
              🧹 Limpar {pedidosTestes.length} pedidos de teste
            </button>
          )}
        </div>

        {/* LISTAGEM COMPACTA */}
        {pedidosFiltrados.length === 0 ? (
          <div className="pedidos-vazio">
            <div className="pedidos-vazio-icon">🛍️</div>
            <strong>
              {filtroTipo === 'testes'
                ? 'Nenhum pedido de teste encontrado'
                : 'Nenhum pedido realizado até o momento.'}
            </strong>
            <span>
              {filtroTipo === 'testes'
                ? 'A base está limpa de pedidos de homologação.'
                : 'Quando uma cliente fizer um pedido pelo aplicativo, ele aparecerá aqui.'}
            </span>
          </div>
        ) : (
          <div className="pedidos-lista-compacta">
            {pedidosFiltrados
              .slice()
              .reverse()
              .map((pedido, indice) => {
                const produtos = obterProdutos(pedido)
                const total = obterTotal(pedido, produtos)
                const cliente = obterNomeCliente(pedido)
                const data = obterDataPedido(pedido)
                const status = obterStatus(pedido.status)
                const eTeste = ehPedidoDeTeste(pedido)
                const expandido = Boolean(pedidosExpandidos[pedido.id])

                const formaPagamento = pedido.forma_pagamento || 'Não informado'
                const statusPagamento =
                  pedido.status_pagamento === 'aprovado'
                    ? 'Pago'
                    : pedido.status_pagamento === 'recusado'
                      ? 'Recusado'
                      : pedido.status_pagamento === 'cancelado'
                        ? 'Cancelado'
                        : pedido.status_pagamento === 'expirado'
                          ? 'Expirado'
                          : pedido.status_pagamento === 'reembolsado'
                            ? 'Reembolsado'
                            : pedido.status_pagamento === 'pendente'
                              ? 'Aguardando'
                              : 'Pendente'

                const enderecoEntrega = [
                  pedido.endereco_entrega,
                  pedido.numero_entrega,
                  pedido.complemento_entrega,
                  pedido.bairro_entrega,
                  pedido.cidade_entrega && pedido.estado_entrega
                    ? `${pedido.cidade_entrega} - ${pedido.estado_entrega}`
                    : pedido.cidade_entrega || pedido.estado_entrega
                ].filter(Boolean).join(', ')

                return (
                  <article
                    className={`pedido-ticket-compacto ${eTeste ? 'pedido-teste' : ''}`}
                    key={pedido.id || pedido.numero || indice}
                  >
                    {/* LINHA PRINCIPAL OPERACIONAL (COMPACTA) */}
                    <div className="pedido-compacto-main">
                      {/* 1. NÚMERO + DATA */}
                      <div className="pedido-col-ident">
                        <div className="pedido-numero-tag">
                          <strong>#{obterNumeroPedido(pedido, indice)}</strong>
                          {eTeste && <span className="ticket-tag-teste">🧪 Teste</span>}
                        </div>
                        <span className="pedido-data-compact">
                          {formatarData(data)} • {formatarHora(data)}
                        </span>
                      </div>

                      {/* 2. CLIENTE */}
                      <div className="pedido-col-cliente" title={cliente}>
                        <strong className="pedido-cliente-nome">{cliente}</strong>
                        <small className="pedido-cliente-sub">
                          {pedido.email_cliente || pedido.telefone_cliente || `${produtos.length} item(ns)`}
                        </small>
                      </div>

                      {/* 3. FORMA E STATUS PAGAMENTO */}
                      <div className="pedido-col-pagamento">
                        <span className="pedido-pag-metodo">{formaPagamento}</span>
                        <span
                          className={`pedido-pag-status ${
                            statusPagamento === 'Pago'
                              ? 'pago'
                              : statusPagamento === 'Cancelado' || statusPagamento === 'Recusado'
                                ? 'cancelado'
                                : 'pendente'
                          }`}
                        >
                          ● {statusPagamento}
                        </span>
                      </div>

                      {/* 4. TOTAL */}
                      <div className="pedido-col-total">
                        <span className="pedido-total-label">Total</span>
                        <strong className="pedido-total-valor">
                          {formatarPreco(total)}
                        </strong>
                      </div>

                      {/* 5. STATUS DO PEDIDO */}
                      <div className="pedido-col-status">
                        <span className={`status-pill ${obterClasseStatus(status)}`}>
                          {status}
                        </span>
                      </div>

                      {/* 6. AÇÕES RÁPIDAS */}
                      <div className="pedido-col-acoes">
                        <button
                          type="button"
                          className={`btn-toggle-detalhes ${expandido ? 'aberto' : ''}`}
                          onClick={() => toggleExpandir(pedido.id)}
                          title={expandido ? 'Recolher detalhes' : 'Ver detalhes do pedido'}
                        >
                          {expandido ? '▲ Menos' : '▼ Detalhes'}
                        </button>

                        {obterTransicoesPedido(status).map((itemStatus) => (
                          <button
                            type="button"
                            key={itemStatus}
                            className="btn-status-acao-compact"
                            disabled={atualizandoPedido === pedido.id}
                            onClick={() => alterarStatus(
                              pedido,
                              itemStatus,
                              itemStatus === 'Enviado' ? envioPorPedido[pedido.id] : undefined
                            )}
                          >
                            {atualizandoPedido === pedido.id
                              ? '...'
                              : itemStatus === 'Cancelado'
                                ? 'Cancelar'
                                : `→ ${itemStatus}`}
                          </button>
                        ))}

                        {eTeste && (
                          <button
                            type="button"
                            className="btn-remover-teste-compact"
                            disabled={atualizandoPedido === pedido.id}
                            onClick={() => handleRemoverPedidoTeste(pedido)}
                            title="Remover teste"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>

                    {/* DETALHES EXPANSÍVEIS (ITENS, ENTREGA, RASTREIO) */}
                    {expandido && (
                      <div className="pedido-compacto-detalhes">
                        {/* BLOCO 1: ITENS DO PEDIDO */}
                        <div className="detalhes-bloco">
                          <span className="detalhes-bloco-titulo">
                            Peças do Pedido ({produtos.length})
                          </span>
                          <div className="detalhes-itens-lista">
                            {produtos.length === 0 ? (
                              <span style={{ color: '#7b8567', fontSize: '11px' }}>
                                Nenhum item detalhado neste pedido.
                              </span>
                            ) : (
                              produtos.map((produto, itemIndex) => {
                                const precoUnitario = Number(
                                  produto.preco ?? produto.venda ?? produto.valor ?? 0
                                )
                                const qtd = Number(produto.quantidade || 1)
                                const tamanho = produto.tamanho || produto.tamanho_nome || '-'

                                return (
                                  <div
                                    className="detalhes-item-linha"
                                    key={produto.id || `${produto.nome}-${itemIndex}`}
                                  >
                                    <span className="detalhes-item-nome">
                                      {qtd}x {produto.nome || produto.produto_nome || 'Produto'}
                                      <span className="detalhes-item-tam">[{tamanho}]</span>
                                    </span>
                                    <span className="detalhes-item-preco">
                                      {formatarPreco(precoUnitario * qtd)}
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>

                        {/* BLOCO 2: ENTREGA & RASTREAMENTO */}
                        <div className="detalhes-bloco">
                          <span className="detalhes-bloco-titulo">Entrega & Rastreio</span>
                          <div className="detalhes-info-card">
                            {enderecoEntrega ? (
                              <>
                                <strong>{enderecoEntrega}</strong>
                                <small>CEP: {pedido.cep_entrega || '-'}</small>
                              </>
                            ) : (
                              <span>Retirada / Sem endereço informado.</span>
                            )}

                            {(pedido.transportadora || pedido.codigo_rastreio || pedido.url_rastreio) && (
                              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #e2dbce' }}>
                                {pedido.transportadora && <div>Transportadora: <strong>{pedido.transportadora}</strong></div>}
                                {pedido.codigo_rastreio && <div>Rastreio: <code>{pedido.codigo_rastreio}</code></div>}
                                {pedido.url_rastreio && (
                                  <a href={pedido.url_rastreio} target="_blank" rel="noreferrer" style={{ color: '#234b36', fontWeight: 600 }}>
                                    Acompanhar entrega ↗
                                  </a>
                                )}
                              </div>
                            )}

                            {obterTransicoesPedido(status).includes('Enviado') && (
                              <div className="form-rastreio-compacto">
                                <input
                                  type="text"
                                  placeholder="Transportadora"
                                  value={envioPorPedido[pedido.id]?.transportadora || ''}
                                  onChange={(e) => setEnvioPorPedido((atual) => ({
                                    ...atual,
                                    [pedido.id]: {
                                      ...atual[pedido.id],
                                      transportadora: e.target.value
                                    }
                                  }))}
                                />
                                <input
                                  type="text"
                                  placeholder="Cód. Rastreio"
                                  value={envioPorPedido[pedido.id]?.codigoRastreio || ''}
                                  onChange={(e) => setEnvioPorPedido((atual) => ({
                                    ...atual,
                                    [pedido.id]: {
                                      ...atual[pedido.id],
                                      codigoRastreio: e.target.value
                                    }
                                  }))}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Pedidos

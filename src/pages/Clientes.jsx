import { useEffect, useMemo, useState } from 'react'
import { carregarClientes } from '../storage'
import {
  filtrarEOrdenarClientes,
  formatarCpfOfuscado,
  formatarTelefone
} from './clientesHelpers'
import { obterStatusPagamento, obterStatusPedido } from './statusHelpers'
import './Clientes.css'

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatarData(data) {
  if (!data) return '--'
  const dataObj = new Date(data)
  if (Number.isNaN(dataObj.getTime())) return '--'
  return dataObj.toLocaleDateString('pt-BR')
}

function extrairItensResumo(pedido) {
  const itens = pedido.itens || pedido.produtos || []
  if (Array.isArray(itens) && itens.length > 0) {
    return itens
      .map((item) => `${item.nome || 'Item'}${item.tamanho ? ` (${item.tamanho})` : ''} × ${item.quantidade || 1}`)
      .join(', ')
  }
  return 'Itens não especificados'
}

function Clientes() {
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [ordenacao, setOrdenacao] = useState('recente')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)

  async function carregarDados() {
    try {
      setCarregando(true)
      setErro(null)
      const lista = await carregarClientes()
      setClientes(Array.isArray(lista) ? lista : [])
    } catch (err) {
      console.error('Erro ao carregar clientes:', err)
      setErro('Não foi possível carregar a lista de clientes.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Métricas gerais
  const metricas = useMemo(() => {
    const totalClientes = clientes.length
    const recorrentes = clientes.filter((c) => c.status === 'Recorrente').length
    const faturamentoTotal = clientes.reduce((acc, c) => acc + (c.totalGasto || 0), 0)
    const totalPedidosValidos = clientes.reduce(
      (acc, c) => acc + (c.pedidosValidos?.length || 0),
      0
    )
    const ticketMedioGeral = totalPedidosValidos > 0 ? faturamentoTotal / totalPedidosValidos : 0

    return {
      totalClientes,
      recorrentes,
      faturamentoTotal,
      ticketMedioGeral
    }
  }, [clientes])

  // Filtragem e ordenação
  const clientesExibidos = useMemo(() => {
    return filtrarEOrdenarClientes(clientes, {
      busca,
      filtroStatus,
      ordenacao
    })
  }, [clientes, busca, filtroStatus, ordenacao])

  const abrirWhatsApp = (cliente) => {
    if (!cliente.telefone) return
    const digits = cliente.telefone.replace(/\D/g, '')
    const numeroCompleto = digits.startsWith('55') ? digits : `55${digits}`
    const mensagem = `Olá, ${cliente.nome}! Entramos em contato do Bazar Encanto Feminino.`
    window.open(`https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  return (
    <div className="clientes-page">
      {/* ===================================================
          CABEÇALHO
      =================================================== */}
      <header className="clientes-header">
        <div>
          <span className="clientes-eyebrow">BAZAR ENCANTO FEMININO</span>
          <h1>Clientes</h1>
          <p>Acompanhe sua base de clientes, histórico de pedidos e fidelização.</p>
        </div>
      </header>

      {/* ===================================================
          CARDS DE RESUMO
      =================================================== */}
      <section className="clientes-cards">
        <div className="cliente-card">
          <div className="cliente-card-icon purple">♡</div>
          <div>
            <span>Total de clientes</span>
            <strong>{metricas.totalClientes}</strong>
          </div>
        </div>

        <div className="cliente-card">
          <div className="cliente-card-icon green">★</div>
          <div>
            <span>Clientes recorrentes</span>
            <strong>{metricas.recorrentes}</strong>
          </div>
        </div>

        <div className="cliente-card">
          <div className="cliente-card-icon gold">$</div>
          <div>
            <span>Ticket médio</span>
            <strong>{formatarPreco(metricas.ticketMedioGeral)}</strong>
          </div>
        </div>

        <div className="cliente-card">
          <div className="cliente-card-icon rose">❖</div>
          <div>
            <span>Faturamento clientes</span>
            <strong>{formatarPreco(metricas.faturamentoTotal)}</strong>
          </div>
        </div>
      </section>

      {/* ===================================================
          PAINEL PRINCIPAL COM TABELA E FILTROS
      =================================================== */}
      <div className="clientes-panel">
        <div className="clientes-panel-header">
          <div>
            <span>RELACIONAMENTO</span>
            <h2>Lista de clientes</h2>
            <p>Gerencie informações de contato e compras realizadas</p>
          </div>
          <div className="clientes-total-badge">
            {clientesExibidos.length} {clientesExibidos.length === 1 ? 'cliente' : 'clientes'}
          </div>
        </div>

        {/* BARRA DE BUSCA E FILTROS */}
        <div className="clientes-toolbar">
          <div className="clientes-busca-wrap">
            <span className="clientes-busca-icon">🔍</span>
            <input
              type="text"
              className="clientes-busca-input"
              placeholder="Buscar por nome, e-mail, telefone ou cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar clientes"
            />
          </div>

          <div className="clientes-filtros-wrap">
            <select
              className="clientes-select"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              aria-label="Filtrar por status do cliente"
            >
              <option value="todos">Todos os status</option>
              <option value="novos">Novos</option>
              <option value="recorrentes">Recorrentes</option>
              <option value="inativos">Inativos</option>
            </select>

            <select
              className="clientes-select"
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
              aria-label="Ordenar clientes"
            >
              <option value="recente">Compra mais recente</option>
              <option value="maior-valor">Maior valor gasto</option>
              <option value="mais-pedidos">Mais pedidos</option>
              <option value="nome">Nome (A-Z)</option>
            </select>
          </div>
        </div>

        {/* ESTADOS DE CARREGAMENTO / ERRO / VAZIO */}
        {carregando && (
          <div className="clientes-feedback-state">
            <span>✿</span>
            <strong>Carregando base de clientes...</strong>
          </div>
        )}

        {erro && !carregando && (
          <div className="clientes-feedback-state error">
            <p>{erro}</p>
            <button type="button" className="btn-tentar-novamente" onClick={carregarDados}>
              Tentar novamente
            </button>
          </div>
        )}

        {!carregando && !erro && clientesExibidos.length === 0 && (
          <div className="clientes-vazio">
            <div className="clientes-vazio-icon">♡</div>
            <strong>Nenhum cliente encontrado</strong>
            <p>
              {busca || filtroStatus !== 'todos'
                ? 'Tente alterar os termos da busca ou os filtros selecionados.'
                : 'Quando forem realizados pedidos na loja, as clientes aparecerão aqui automaticamente.'}
            </p>
          </div>
        )}

        {/* TABELA DESKTOP */}
        {!carregando && !erro && clientesExibidos.length > 0 && (
          <>
            <div className="clientes-tabela-wrapper">
              <table className="clientes-tabela">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Pedidos</th>
                    <th>Total gasto</th>
                    <th>Ticket médio</th>
                    <th>Última compra</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesExibidos.map((cliente) => {
                    const inicial = cliente.nome.charAt(0).toUpperCase() || 'C'
                    const statusClass =
                      cliente.status === 'Recorrente'
                        ? 'recorrente'
                        : cliente.status === 'Inativo'
                          ? 'inativo'
                          : 'novo'

                    return (
                      <tr key={cliente.id}>
                        <td>
                          <div className="cliente-identidade">
                            <div className="cliente-avatar">{inicial}</div>
                            <div>
                              <strong>{cliente.nome}</strong>
                              {(cliente.cidade || cliente.estado) && (
                                <small>
                                  {[cliente.cidade, cliente.estado].filter(Boolean).join(' - ')}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="cliente-contato">
                            <span>{cliente.email}</span>
                            {cliente.telefone && (
                              <small>{formatarTelefone(cliente.telefone)}</small>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong>{cliente.pedidos.length}</strong>
                        </td>
                        <td>
                          <strong>{formatarPreco(cliente.totalGasto)}</strong>
                        </td>
                        <td>
                          <span>{formatarPreco(cliente.ticketMedio)}</span>
                        </td>
                        <td>
                          <span>{formatarData(cliente.ultimaCompra)}</span>
                        </td>
                        <td>
                          <span className={`cliente-badge ${statusClass}`}>
                            {cliente.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-ver-detalhes"
                            onClick={() => setClienteSelecionado(cliente)}
                          >
                            Ver detalhes →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* LISTAGEM EM CARDS PARA MOBILE */}
            <div className="clientes-mobile-cards">
              {clientesExibidos.map((cliente) => {
                const inicial = cliente.nome.charAt(0).toUpperCase() || 'C'
                const statusClass =
                  cliente.status === 'Recorrente'
                    ? 'recorrente'
                    : cliente.status === 'Inativo'
                      ? 'inativo'
                      : 'novo'

                return (
                  <div className="cliente-mobile-card" key={cliente.id}>
                    <div className="cliente-mobile-header">
                      <div className="cliente-identidade">
                        <div className="cliente-avatar">{inicial}</div>
                        <div>
                          <strong>{cliente.nome}</strong>
                          <span className="cliente-mobile-email">{cliente.email}</span>
                        </div>
                      </div>
                      <span className={`cliente-badge ${statusClass}`}>
                        {cliente.status}
                      </span>
                    </div>

                    <div className="cliente-mobile-grid">
                      <div>
                        <span>Pedidos</span>
                        <strong>{cliente.pedidos.length}</strong>
                      </div>
                      <div>
                        <span>Total gasto</span>
                        <strong>{formatarPreco(cliente.totalGasto)}</strong>
                      </div>
                      <div>
                        <span>Última compra</span>
                        <strong>{formatarData(cliente.ultimaCompra)}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-ver-detalhes full-width"
                      onClick={() => setClienteSelecionado(cliente)}
                    >
                      Ver detalhes do cliente →
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ===================================================
          MODAL DE DETALHE DO CLIENTE
      =================================================== */}
      {clienteSelecionado && (
        <div
          className="clientes-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClienteSelecionado(null)
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes de ${clienteSelecionado.nome}`}
        >
          <div className="clientes-modal">
            <button
              type="button"
              className="clientes-modal-fechar"
              onClick={() => setClienteSelecionado(null)}
              aria-label="Fechar detalhes"
            >
              ✕
            </button>

            {/* CABEÇALHO DO CLIENTE */}
            <div className="clientes-modal-topo">
              <div className="clientes-modal-avatar">
                {clienteSelecionado.nome.charAt(0).toUpperCase() || 'C'}
              </div>
              <div className="clientes-modal-info-principal">
                <div className="clientes-modal-nome-badge">
                  <h2>{clienteSelecionado.nome}</h2>
                  <span
                    className={`cliente-badge ${
                      clienteSelecionado.status === 'Recorrente'
                        ? 'recorrente'
                        : clienteSelecionado.status === 'Inativo'
                          ? 'inativo'
                          : 'novo'
                    }`}
                  >
                    {clienteSelecionado.status}
                  </span>
                </div>
                <p>{clienteSelecionado.email}</p>
                {clienteSelecionado.telefone && (
                  <p>{formatarTelefone(clienteSelecionado.telefone)}</p>
                )}
                {clienteSelecionado.cpf && (
                  <small>CPF: {formatarCpfOfuscado(clienteSelecionado.cpf)}</small>
                )}
              </div>

              {clienteSelecionado.telefone && (
                <button
                  type="button"
                  className="btn-whatsapp-cliente"
                  onClick={() => abrirWhatsApp(clienteSelecionado)}
                >
                  <span>💬</span> Falar no WhatsApp
                </button>
              )}
            </div>

            {/* ENDEREÇO DE ENTREGA MAIS RECENTE */}
            {clienteSelecionado.ultimoEndereco && (
              <div className="clientes-modal-endereco">
                <strong>Endereço de entrega recente:</strong>
                <span>{clienteSelecionado.ultimoEndereco}</span>
              </div>
            )}

            {/* MÉTRICAS DO CLIENTE */}
            <div className="clientes-modal-metricas">
              <div className="cliente-metrica-card">
                <span>Total gasto</span>
                <strong>{formatarPreco(clienteSelecionado.totalGasto)}</strong>
              </div>
              <div className="cliente-metrica-card">
                <span>Ticket médio</span>
                <strong>{formatarPreco(clienteSelecionado.ticketMedio)}</strong>
              </div>
              <div className="cliente-metrica-card">
                <span>Pedidos realizados</span>
                <strong>{clienteSelecionado.pedidos.length}</strong>
              </div>
              <div className="cliente-metrica-card">
                <span>Primeira compra</span>
                <strong>{formatarData(clienteSelecionado.primeiraCompra)}</strong>
              </div>
            </div>

            {/* HISTÓRICO COMPLETO DE PEDIDOS */}
            <div className="clientes-modal-historico">
              <h3>Histórico de compras ({clienteSelecionado.pedidos.length})</h3>

              <div className="clientes-historico-tabela-wrap">
                <table className="clientes-historico-tabela">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Data</th>
                      <th>Itens</th>
                      <th>Forma</th>
                      <th>Status</th>
                      <th>Pagamento</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clienteSelecionado.pedidos.map((pedido) => {
                      const statusPed = obterStatusPedido(pedido.status)
                      const statusPag = obterStatusPagamento(pedido.status_pagamento)
                      const cancelado = pedido.status === 'Cancelado'

                      return (
                        <tr key={pedido.id || pedido.numero} className={cancelado ? 'pedido-cancelado' : ''}>
                          <td>
                            <strong>{pedido.numero}</strong>
                          </td>
                          <td>{formatarData(pedido.data || pedido.dataPedido || pedido.createdAt)}</td>
                          <td className="historico-itens-cell">
                            {extrairItensResumo(pedido)}
                          </td>
                          <td>{pedido.forma_pagamento || '--'}</td>
                          <td>
                            <span className={`status-tag status-${String(statusPed).toLowerCase().replace(/\s+/g, '-')}`}>
                              {statusPed}
                            </span>
                          </td>
                          <td>
                            <span className={`status-tag ${statusPag.aprovado ? 'status-pago' : 'status-pendente'}`}>
                              {statusPag.resumo}
                            </span>
                          </td>
                          <td>
                            <strong>{formatarPreco(pedido.total || pedido.valorTotal)}</strong>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clientes

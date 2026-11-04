import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './Pedidos.css'

import { supabase } from '../lib/supabase'
import {
  carregarPedidos as carregarPedidosSupabase,
  atualizarStatusPedido,
  confirmarPagamentoPixVendaDireta,
  removerPedido
} from '../storage'
import {
  obterStatusPedido,
  ehPedidoDeTeste
} from './statusHelpers'
import {
  ordenarPedidosMaisRecentes,
  formatarPreco,
  formatarDataHora,
  obterProdutos,
  obterTotalPedido,
  obterResumoItens,
  identificarNovosPedidos
} from './pedidosHelpers'

function obterNomeCliente(pedido) {
  return (
    pedido?.nomeCliente ||
    pedido?.cliente ||
    pedido?.nome ||
    'Cliente não informada'
  )
}

function obterNumeroPedido(pedido, indice = 0) {
  if (pedido?.numero) return String(pedido.numero)
  if (pedido?.id) return String(pedido.id).slice(-6)
  return String(indice + 1).padStart(4, '0')
}

function obterStatus(status) {
  return obterStatusPedido(status)
}

function obterClasseStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('recebido') || s.includes('confirmado')) return 'confirmado'
  if (s.includes('aguardando')) return 'aguardando'
  if (s.includes('preparação') || s.includes('preparacao')) return 'preparacao'
  if (s.includes('pronto')) return 'pronto'
  if (s.includes('enviado')) return 'enviado'
  if (s.includes('entregue') || s.includes('concluído') || s.includes('concluido')) return 'entregue'
  if (s.includes('cancelado') || s.includes('recusado')) return 'cancelado'
  return 'confirmado'
}

function obterClassePagamento(statusPag) {
  const s = String(statusPag || '').toLowerCase()
  if (['pago', 'aprovado', 'approved', 'confirmado'].includes(s)) return 'pago'
  if (['aguardando', 'pendente', 'pending', 'in_process'].includes(s)) return 'pendente'
  if (['cancelado', 'recusado', 'rejeitado', 'expirado', 'reembolsado'].includes(s)) return 'cancelado'
  return 'pendente'
}

function formatarStatusPagamento(statusPagamento) {
  const s = String(statusPagamento || '').toLowerCase()
  if (['aprovado', 'approved', 'pago', 'paga'].includes(s)) return 'Pago'
  if (['recusado', 'rejected', 'rejeitado'].includes(s)) return 'Recusado'
  if (['cancelado', 'cancelled', 'canceled'].includes(s)) return 'Cancelado'
  if (['expirado', 'expired'].includes(s)) return 'Expirado'
  if (['reembolsado', 'refunded'].includes(s)) return 'Reembolsado'
  if (['pendente', 'pending', 'in_process', 'aguardando', 'aguardando pagamento'].includes(s)) return 'Aguardando'
  return statusPagamento || 'Pendente'
}

function Pedidos({ usuarioLogado, papelUsuario: _papelUsuario }) {
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizandoPedido, setAtualizandoPedido] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca] = useState('')

  // Modal de detalhes do pedido
  const [pedidoModal, setPedidoModal] = useState(null)
  const [formEdicao, setFormEdicao] = useState({
    status: '',
    transportadora: '',
    codigoRastreio: '',
    urlRastreio: '',
    observacaoInterna: ''
  })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState('')

  // Controle de novos pedidos na sessão e notificações
  const [pedidosNovosIds, setPedidosNovosIds] = useState(new Set())
  const [notificacaoAtiva, setNotificacaoAtiva] = useState(null)
  const pedidosConhecidosIdsRef = useRef(new Set())
  const pedidosNotificadosIdsRef = useRef(new Set())
  const inicializadoRef = useRef(false)

  // Notificar o App sobre a contagem de novos pedidos não vistos
  useEffect(() => {
    const totalNovos = pedidosNovosIds.size
    window.dispatchEvent(
      new CustomEvent('bazar_pedidos_novos_count', { detail: totalNovos })
    )
  }, [pedidosNovosIds])

  // Marcar pedido como visto
  const marcarPedidoComoVisto = (pedidoId) => {
    const idStr = String(pedidoId)
    setPedidosNovosIds((prev) => {
      if (!prev.has(idStr)) return prev
      const proximo = new Set(prev)
      proximo.delete(idStr)
      return proximo
    })
  }

  // Abrir modal de detalhes
  const abrirDetalhes = (pedido) => {
    if (!pedido) return
    const idStr = String(pedido.id || pedido.numero)
    marcarPedidoComoVisto(idStr)

    setPedidoModal(pedido)
    setFormEdicao({
      status: obterStatus(pedido.status),
      transportadora: pedido.transportadora || '',
      codigoRastreio: pedido.codigo_rastreio || '',
      urlRastreio: pedido.url_rastreio || '',
      observacaoInterna: pedido.observacao_interna || pedido.observacao_envio || ''
    })
    setMensagemSucesso('')
  }

  const fecharDetalhes = () => {
    setPedidoModal(null)
    setMensagemSucesso('')
  }

  // Ação ao clicar em "Ver pedido" na notificação toast
  const handleVerPedidoNotificacao = (pedidoId) => {
    const idStr = String(pedidoId)
    const pedidoAlvo = pedidos.find((p) => String(p.id || p.numero) === idStr)
    if (pedidoAlvo) {
      abrirDetalhes(pedidoAlvo)
    }
    setNotificacaoAtiva(null)
  }

  // =====================================================
  // CARREGAR PEDIDOS E TRATAR NOVOS
  // =====================================================
  const processarCarregamentoPedidos = useCallback((listaPedidos) => {
    const listaOrdenada = ordenarPedidosMaisRecentes(listaPedidos)

    if (!inicializadoRef.current) {
      // Primeira carga: registra todos como conhecidos sem disparar toast
      const conhecidos = new Set()
      listaOrdenada.forEach((p) => {
        const pId = String(p.id || p.numero)
        if (pId) conhecidos.add(pId)
      })
      pedidosConhecidosIdsRef.current = conhecidos
      inicializadoRef.current = true
      setPedidos(listaOrdenada)
      return
    }

    // Cargas subsequentes: identificar se há pedidos genuinamente novos
    const novos = identificarNovosPedidos(
      listaOrdenada,
      pedidosConhecidosIdsRef.current,
      pedidosNotificadosIdsRef.current
    )

    if (novos.length > 0) {
      // Atualiza conjunto de conhecidos e notificados
      setPedidosNovosIds((prev) => {
        const novoSetNovos = new Set(prev)
        novos.forEach((p) => {
          const pId = String(p.id || p.numero)
          pedidosConhecidosIdsRef.current.add(pId)
          pedidosNotificadosIdsRef.current.add(pId)
          novoSetNovos.add(pId)
        })
        return novoSetNovos
      })

      // Exibe toast do pedido mais recente
      const maisRecente = novos[0]
      const produtosMaisRecente = obterProdutos(maisRecente)
      const totalRecente = obterTotalPedido(maisRecente, produtosMaisRecente)

      setNotificacaoAtiva({
        id: String(maisRecente.id || maisRecente.numero),
        numero: obterNumeroPedido(maisRecente),
        cliente: obterNomeCliente(maisRecente),
        total: totalRecente,
        timestamp: Date.now()
      })
    }

    // Se o modal estiver aberto, atualiza com os dados mais recentes do pedido
    setPedidoModal((atual) => {
      if (!atual) return null
      const idAtual = String(atual.id || atual.numero)
      const atualizado = listaOrdenada.find((p) => String(p.id || p.numero) === idAtual)
      return atualizado || atual
    })

    setPedidos(listaOrdenada)
  }, [])

  // =====================================================
  // SUBSCRIPTION REALTIME E POLLING SEGURO
  // =====================================================
  useEffect(() => {
    let ativo = true

    async function buscarPedidosInicial() {
      try {
        setCarregando(true)
        const pedidosSupabase = await carregarPedidosSupabase()
        if (!ativo) return
        processarCarregamentoPedidos(Array.isArray(pedidosSupabase) ? pedidosSupabase : [])
      } catch (erro) {
        console.error('Erro ao carregar pedidos do Supabase:', erro)
        if (ativo) setPedidos([])
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    buscarPedidosInicial()

    // Realtime do Supabase com canal dedicado e cleanup estrito
    let canalRealtime = null
    try {
      canalRealtime = supabase
        .channel('admin_pedidos_tabela_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos' },
          async () => {
            if (!ativo) return
            try {
              const atualizados = await carregarPedidosSupabase()
              if (ativo && Array.isArray(atualizados)) {
                processarCarregamentoPedidos(atualizados)
              }
            } catch (err) {
              console.error('Erro ao sincronizar pedidos via Realtime:', err)
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Conectado ao Realtime
          }
        })
    } catch (e) {
      console.warn('Realtime indisponível, usando polling:', e)
    }

    // Polling leve de segurança a cada 30 segundos
    const intervaloPolling = setInterval(async () => {
      if (!ativo) return
      try {
        const atualizados = await carregarPedidosSupabase()
        if (ativo && Array.isArray(atualizados)) {
          processarCarregamentoPedidos(atualizados)
        }
      } catch (err) {
        console.warn('Erro no polling de pedidos:', err)
      }
    }, 30000)

    return () => {
      ativo = false
      clearInterval(intervaloPolling)
      if (canalRealtime) {
        supabase.removeChannel(canalRealtime)
      }
    }
  }, [processarCarregamentoPedidos])

  // Auto-dismiss da notificação toast após 10 segundos
  useEffect(() => {
    if (!notificacaoAtiva) return
    const timer = setTimeout(() => {
      setNotificacaoAtiva(null)
    }, 10000)
    return () => clearTimeout(timer)
  }, [notificacaoAtiva])

  // =====================================================
  // AÇÕES E SALVAMENTO ADMINISTRATIVO DO PEDIDO
  // =====================================================

  // Salvar alterações administrativas do modal
  const handleSalvarEdicaoModal = async (e) => {
    if (e) e.preventDefault()
    if (!pedidoModal?.id) return

    try {
      setSalvandoEdicao(true)
      setMensagemSucesso('')

      const novoStatus = formEdicao.status || obterStatus(pedidoModal.status)

      if (
        novoStatus === 'Cancelado' &&
        obterStatus(pedidoModal.status) !== 'Cancelado' &&
        !window.confirm('Confirma o cancelamento deste pedido?')
      ) {
        setSalvandoEdicao(false)
        return
      }

      const pedidosAtualizados = await atualizarStatusPedido(
        pedidoModal.id,
        novoStatus,
        {
          transportadora: formEdicao.transportadora.trim() || null,
          codigoRastreio: formEdicao.codigoRastreio.trim() || null,
          urlRastreio: formEdicao.urlRastreio.trim() || null,
          observacaoInterna: formEdicao.observacaoInterna.trim() || null,
          usuarioResponsavel: usuarioLogado?.user_metadata?.name || usuarioLogado?.email || 'Admin'
        }
      )

      if (!Array.isArray(pedidosAtualizados)) {
        throw new Error('Erro ao salvar alterações no pedido.')
      }

      setPedidoModal((prev) => (prev ? {
        ...prev,
        status: novoStatus,
        transportadora: formEdicao.transportadora.trim() || prev.transportadora,
        codigo_rastreio: formEdicao.codigoRastreio.trim() || prev.codigo_rastreio,
        url_rastreio: formEdicao.urlRastreio.trim() || prev.url_rastreio,
        observacao_interna: formEdicao.observacaoInterna.trim() || prev.observacao_interna
      } : null))

      processarCarregamentoPedidos(pedidosAtualizados)
      setMensagemSucesso('✓ Status e alterações salvas com sucesso!')

      setTimeout(() => {
        setMensagemSucesso('')
      }, 4000)
    } catch (erro) {
      console.error('Erro ao salvar alterações do pedido:', erro)
      window.alert(erro.message || 'Não foi possível salvar as alterações.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const handleConfirmarPixVendaDireta = async () => {
    if (!pedidoModal?.id) return
    const confirmou = window.confirm(
      `Confirma o recebimento do PIX para o Pedido #${obterNumeroPedido(pedidoModal)} no valor de ${formatarPreco(pedidoModal.total)}?`
    )
    if (!confirmou) return

    try {
      setSalvandoEdicao(true)
      const res = await confirmarPagamentoPixVendaDireta(
        pedidoModal.id,
        usuarioLogado?.user_metadata?.name || usuarioLogado?.email || 'Admin'
      )
      if (!res.sucesso) {
        window.alert(res.mensagem || 'Não foi possível confirmar o pagamento Pix.')
        return
      }

      setPedidoModal((prev) => ({
        ...prev,
        status: res.status || 'Confirmado',
        status_pagamento: res.status_pagamento || 'aprovado',
        pix_confirmado_em: res.pix_confirmado_em,
        pix_confirmado_por: res.pix_confirmado_por
      }))
      setFormEdicao((prev) => ({ ...prev, status: 'Confirmado' }))
      setMensagemSucesso('✓ Pagamento Pix confirmado manualmente com sucesso!')
      setTimeout(() => setMensagemSucesso(''), 4000)
      const pedidosAtualizados = await carregarPedidosSupabase()
      processarCarregamentoPedidos(Array.isArray(pedidosAtualizados) ? pedidosAtualizados : [])
    } catch (err) {
      console.error('Erro ao confirmar Pix:', err)
      window.alert('Erro ao confirmar pagamento Pix.')
    } finally {
      setSalvandoEdicao(false)
    }
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
      if (pedidoModal?.id === pedido.id) {
        fecharDetalhes()
      }
      processarCarregamentoPedidos(Array.isArray(pedidosAtualizados) ? pedidosAtualizados : [])
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
      if (pedidoModal && ehPedidoDeTeste(pedidoModal)) {
        fecharDetalhes()
      }
      const pedidosAtualizados = await carregarPedidosSupabase()
      processarCarregamentoPedidos(Array.isArray(pedidosAtualizados) ? pedidosAtualizados : [])
      window.alert(`Limpeza concluída! ${testes.length} pedidos de teste foram removidos.`)
    } catch (erro) {
      console.error('Erro na limpeza de pedidos de teste:', erro)
      window.alert('Erro ao limpar pedidos de teste.')
    } finally {
      setAtualizandoPedido(null)
    }
  }

  const pedidosTestes = useMemo(() => pedidos.filter(ehPedidoDeTeste), [pedidos])
  const pedidosReais = useMemo(() => pedidos.filter((p) => !ehPedidoDeTeste(p)), [pedidos])

  // Filtragem e ordenação estrita: MAIS RECENTE → MAIS ANTIGO
  const pedidosFiltrados = useMemo(() => {
    const filtrados = pedidos.filter((pedido) => {
      // Filtro tipo (todos / reais / testes)
      if (filtroTipo === 'reais' && ehPedidoDeTeste(pedido)) return false
      if (filtroTipo === 'testes' && !ehPedidoDeTeste(pedido)) return false

      // Filtro status
      const status = obterStatus(pedido.status)
      if (filtroStatus !== 'todos') {
        if (filtroStatus === 'pago' && status !== 'Confirmado' && pedido.status_pagamento !== 'aprovado') {
          return false
        } else if (filtroStatus !== 'pago' && status.toLowerCase() !== filtroStatus.toLowerCase()) {
          return false
        }
      }

      // Filtro busca textual
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase()
        const cliente = obterNomeCliente(pedido).toLowerCase()
        const num = String(pedido.numero || pedido.id || '').toLowerCase()
        const email = String(pedido.email_cliente || pedido.email || '').toLowerCase()
        const tel = String(pedido.telefone_cliente || pedido.telefone || '').toLowerCase()
        const rastreio = String(pedido.codigo_rastreio || '').toLowerCase()

        const produtos = obterProdutos(pedido)
        const matchItem = produtos.some((item) =>
          String(item.nome || item.produto_nome || '').toLowerCase().includes(termo)
        )

        if (
          !cliente.includes(termo) &&
          !num.includes(termo) &&
          !email.includes(termo) &&
          !tel.includes(termo) &&
          !rastreio.includes(termo) &&
          !matchItem
        ) {
          return false
        }
      }

      return true
    })

    return ordenarPedidosMaisRecentes(filtrados)
  }, [pedidos, filtroTipo, filtroStatus, busca])

  // Métricas do topo
  const metricas = useMemo(() => {
    const hoje = new Date()
    let hojeQtd = 0
    let confirmadosQtd = 0
    let aguardandoQtd = 0
    let faturamento = 0

    for (const pedido of pedidosReais) {
      const dataRaw = pedido?.data || pedido?.created_at || pedido?.createdAt || pedido?.criadoEm
      if (dataRaw) {
        const d = new Date(dataRaw)
        if (
          d.getDate() === hoje.getDate() &&
          d.getMonth() === hoje.getMonth() &&
          d.getFullYear() === hoje.getFullYear()
        ) {
          hojeQtd += 1
        }
      }

      const st = obterStatus(pedido.status)
      const stPag = formatarStatusPagamento(pedido.status_pagamento)

      if (st === 'Confirmado' || stPag === 'Pago') {
        confirmadosQtd += 1
      }
      if (st === 'Aguardando pagamento' || stPag === 'Aguardando') {
        aguardandoQtd += 1
      }

      const produtos = obterProdutos(pedido)
      faturamento += obterTotalPedido(pedido, produtos)
    }

    return {
      hojeQtd,
      confirmadosQtd,
      aguardandoQtd,
      faturamento
    }
  }, [pedidosReais])

  // Status disponíveis para edição no modal conforme modalidade de entrega
  const opcoesStatusModal = useMemo(() => {
    if (!pedidoModal) return [
      'Pedido recebido',
      'Em preparação',
      'Enviado',
      'Pronto para retirada',
      'Entregue',
      'Cancelado'
    ]
    const isRetirada = String(pedidoModal.modalidade_entrega || '').toLowerCase().includes('retirada')
    if (isRetirada) {
      return [
        'Pedido recebido',
        'Em preparação',
        'Pronto para retirada',
        'Entregue',
        'Enviado',
        'Cancelado'
      ]
    }
    return [
      'Pedido recebido',
      'Em preparação',
      'Enviado',
      'Entregue',
      'Pronto para retirada',
      'Cancelado'
    ]
  }, [pedidoModal])

  return (
    <div className="pedidos-page">
      {/* NOTIFICAÇÃO TOAST INTERNA QUANDO CHEGA NOVO PEDIDO */}
      {notificacaoAtiva && (
        <aside
          className="pedidos-toast-notificacao"
          role="status"
          aria-live="polite"
        >
          <div className="toast-conteudo">
            <div className="toast-icone">🔔</div>
            <div className="toast-texto">
              <strong>Novo pedido recebido!</strong>
              <span>
                #{notificacaoAtiva.numero} • {notificacaoAtiva.cliente}
              </span>
              <small>{formatarPreco(notificacaoAtiva.total)}</small>
            </div>
          </div>
          <div className="toast-acoes">
            <button
              type="button"
              className="toast-btn-ver"
              onClick={() => handleVerPedidoNotificacao(notificacaoAtiva.id)}
            >
              Ver pedido
            </button>
            <button
              type="button"
              className="toast-btn-fechar"
              onClick={() => setNotificacaoAtiva(null)}
              title="Fechar notificação"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* CABEÇALHO PADRÃO ESTOQUE */}
      <div className="pedidos-header">
        <div>
          <h1>Pedidos</h1>
          <p>
            Acompanhamento operacional em tempo real dos pedidos, histórico de vendas e despacho
          </p>
        </div>

        <div className="pedidos-topo-acoes">
          {pedidosTestes.length > 0 && (
            <button
              type="button"
              className="btn-limpar-testes-topo"
              disabled={Boolean(atualizandoPedido)}
              onClick={handleLimparTodosTestes}
              title="Executar limpeza somente dos pedidos de teste identificados"
            >
              🧹 Limpar {pedidosTestes.length} testes
            </button>
          )}
        </div>
      </div>

      {/* CARDS DE RESUMO DO TOPO (PADRÃO ESTOQUE) */}
      <div className="pedidos-cards-resumo">
        <div className="card">
          <div className="card-icon">🛍️</div>
          <div>
            <span>Pedidos Hoje</span>
            <h2>{metricas.hojeQtd} un.</h2>
            <small>Realizados hoje</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">✓</div>
          <div>
            <span>Confirmados / Pagos</span>
            <h2>{metricas.confirmadosQtd} un.</h2>
            <small>Pagamento aprovado</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">⏳</div>
          <div>
            <span>Aguardando Pagamento</span>
            <h2>{metricas.aguardandoQtd} un.</h2>
            <small>Pendente de confirmação</small>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">💰</div>
          <div>
            <span>Faturamento Real</span>
            <h2>{formatarPreco(metricas.faturamento)}</h2>
            <small>Total em vendas reais</small>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS E BUSCA (PADRÃO ESTOQUE) */}
      <div className="pedidos-filtros-bar">
        <div className="pedidos-busca-wrapper">
          <span className="pedidos-busca-icon">🔎</span>
          <input
            type="text"
            placeholder="Buscar por nº pedido, cliente, e-mail ou produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {/* TABS DE TIPO: TODOS | REAIS | TESTES */}
        <div className="pedidos-switcher-tabs">
          <button
            type="button"
            className={filtroTipo === 'todos' ? 'ativo' : ''}
            onClick={() => setFiltroTipo('todos')}
          >
            Todos ({pedidos.length})
          </button>
          <button
            type="button"
            className={filtroTipo === 'reais' ? 'ativo' : ''}
            onClick={() => setFiltroTipo('reais')}
          >
            Reais ({pedidosReais.length})
          </button>
          <button
            type="button"
            className={filtroTipo === 'testes' ? 'ativo' : ''}
            onClick={() => setFiltroTipo('testes')}
          >
            Testes ({pedidosTestes.length})
          </button>
        </div>

        {/* SELECT DE STATUS */}
        <select
          className="pedidos-select-filtro"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          <option value="todos">Todos os status</option>
          <option value="pedido recebido">Pedido recebido</option>
          <option value="em preparação">Em preparação</option>
          <option value="enviado">Enviado</option>
          <option value="pronto para retirada">Pronto para retirada</option>
          <option value="entregue">Entregue</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* TABELA PRINCIPAL (ÚNICO MODO DE VISUALIZAÇÃO) */}
      {carregando ? (
        <div className="pedidos-carregando">
          <div className="pedidos-loading-icon">⏳</div>
          <strong>Carregando pedidos...</strong>
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="pedidos-busca-vazia">
          <div className="pedidos-busca-vazia-icon">🛍️</div>
          <h3>Nenhum pedido encontrado</h3>
          <p>
            {busca || filtroStatus !== 'todos' || filtroTipo !== 'todos'
              ? 'Tente ajustar ou limpar os filtros para encontrar os pedidos.'
              : 'Nenhum pedido realizado até o momento.'}
          </p>
          {(busca || filtroStatus !== 'todos' || filtroTipo !== 'todos') && (
            <button
              type="button"
              className="pedidos-btn-limpar-filtros"
              onClick={() => {
                setBusca('')
                setFiltroStatus('todos')
                setFiltroTipo('todos')
              }}
            >
              Limpar todos os filtros
            </button>
          )}
        </div>
      ) : (
        <div className="pedidos-tabela-wrapper">
          <table className="pedidos-tabela">
            <thead>
              <tr>
                <th className="th-pedido">Pedido</th>
                <th className="th-data">Data / Hora</th>
                <th className="th-cliente">Cliente</th>
                <th className="th-itens col-secundaria-itens">Itens</th>
                <th className="th-pagamento col-secundaria-pag">Pagamento</th>
                <th className="th-status">Status</th>
                <th className="th-total">Total</th>
                <th className="th-acoes" style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.map((pedido, indice) => {
                const produtos = obterProdutos(pedido)
                const total = obterTotalPedido(pedido, produtos)
                const cliente = obterNomeCliente(pedido)
                const dataRaw = pedido?.data || pedido?.created_at || pedido?.createdAt || pedido?.criadoEm
                const { data, hora } = formatarDataHora(dataRaw)
                const status = obterStatus(pedido.status)
                const eTeste = ehPedidoDeTeste(pedido)
                const pId = String(pedido.id || pedido.numero || indice)
                const ehNovo = pedidosNovosIds.has(pId)
                const statusPagamento = formatarStatusPagamento(pedido.status_pagamento)
                const formaPagamento = pedido.forma_pagamento || 'Não informada'
                const numeroFormatado = obterNumeroPedido(pedido, indice)
                const { totalQtd, itensVisiveis } = obterResumoItens(produtos, 2)

                return (
                  <tr
                    key={pId}
                    id={`pedido-linha-${pId}`}
                    className={`pedidos-tabela-linha ${ehNovo ? 'linha-novo' : ''} ${
                      eTeste ? 'linha-teste' : ''
                    }`}
                    onClick={() => abrirDetalhes(pedido)}
                    title="Clique para abrir os detalhes completos"
                  >
                    {/* PEDIDO */}
                    <td className="td-pedido" data-label="Pedido">
                      <div className="tabela-pedido-col">
                        <button
                          type="button"
                          className="tabela-btn-numero"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirDetalhes(pedido)
                          }}
                          title="Ver detalhes do pedido"
                        >
                          #{numeroFormatado}
                        </button>
                        {ehNovo && <span className="tag-novo-marcador">✨ Novo</span>}
                        {pedido.origem === 'venda_direta' ? (
                          <span className="tag-origem-venda-direta" title="Venda Direta realizada pelo WhatsApp">💬 Venda Direta</span>
                        ) : (
                          <span className="tag-origem-loja" title="Pedido realizado na Loja Online">🌐 Loja</span>
                        )}
                        {eTeste && <span className="ticket-tag-teste">🧪 Teste</span>}
                      </div>
                    </td>

                    {/* DATA / HORA */}
                    <td className="td-data" data-label="Data">
                      <div className="tabela-data-col">
                        <strong>{data}</strong>
                        <small>{hora}</small>
                      </div>
                    </td>

                    {/* CLIENTE */}
                    <td className="td-cliente" data-label="Cliente">
                      <div className="tabela-cliente-col" title={cliente}>
                        <strong className="cliente-nome-tabela">{cliente}</strong>
                        <small className="cliente-sub-tabela">
                          {pedido.email_cliente || pedido.email || pedido.telefone_cliente || pedido.telefone || '-'}
                        </small>
                      </div>
                    </td>

                    {/* ITENS (COLUNA SECUNDÁRIA) */}
                    <td
                      className="td-itens col-secundaria-itens"
                      data-label="Itens"
                      title={itensVisiveis.map((it) => `${it.qtd}x ${it.nome}`).join(', ')}
                    >
                      <div className="tabela-itens-col">
                        <span className="tabela-itens-total">
                          {totalQtd} {totalQtd === 1 ? 'peça' : 'peças'}
                        </span>
                      </div>
                    </td>

                    {/* PAGAMENTO (COLUNA SECUNDÁRIA) */}
                    <td className="td-pagamento col-secundaria-pag" data-label="Pagamento">
                      <div className="tabela-pagamento-col">
                        <span
                          className={`ticket-badge-pagamento ${obterClassePagamento(
                            statusPagamento
                          )}`}
                        >
                          ● {statusPagamento}
                        </span>
                        <small className="tabela-pag-forma">{formaPagamento}</small>
                      </div>
                    </td>

                    {/* STATUS */}
                    <td className="td-status" data-label="Status">
                      <span className={`ticket-badge-status ${obterClasseStatus(status)}`}>
                        {status}
                      </span>
                    </td>

                    {/* TOTAL */}
                    <td className="td-total" data-label="Total">
                      <strong className="tabela-total-valor">{formatarPreco(total)}</strong>
                    </td>

                    {/* AÇÕES */}
                    <td className="td-acoes" data-label="Ações" style={{ textAlign: 'right' }}>
                      <div
                        className="tabela-acoes-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn-tabela-detalhes"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirDetalhes(pedido)
                          }}
                          title="Abrir detalhes completos deste pedido"
                        >
                          👁️ Detalhes
                        </button>

                        {eTeste && (
                          <button
                            type="button"
                            className="ticket-btn-remover-teste"
                            disabled={atualizandoPedido === pedido.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoverPedidoTeste(pedido)
                            }}
                            title="Remover pedido de teste"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================================================
         MODAL GRANDE DE DETALHES COMPLETOS DO PEDIDO
         =================================================== */}
      {pedidoModal && (
        <div
          className="pedido-modal-overlay"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="pedido-modal-detalhes"
          >
            {/* CABEÇALHO DO MODAL */}
            <div className="pedido-modal-header">
              <div className="pedido-modal-titulo-wrap">
                <div className="pedido-modal-icone">🛍️</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2>Pedido #{obterNumeroPedido(pedidoModal)}</h2>
                    {ehPedidoDeTeste(pedidoModal) && (
                      <span className="ticket-tag-teste">🧪 Teste</span>
                    )}
                  </div>
                  <p className="pedido-modal-sub">
                    {formatarDataHora(pedidoModal.data || pedidoModal.created_at).data} às{' '}
                    {formatarDataHora(pedidoModal.data || pedidoModal.created_at).hora} •{' '}
                    Cliente: <strong>{obterNomeCliente(pedidoModal)}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="pedido-modal-btn-fechar"
                onClick={fecharDetalhes}
                title="Fechar detalhes"
              >
                ✕
              </button>
            </div>

            {/* CORPO DO MODAL */}
            <div className="pedido-modal-corpo">
              {mensagemSucesso && (
                <div className="pedido-modal-alerta-sucesso">
                  {mensagemSucesso}
                </div>
              )}

              {/* 1. CARDS DE RESUMO SUPERIOR */}
              <div className="pedido-modal-totais-grid">
                <div className="pedido-modal-total-card status">
                  <span className="mod-tot-label">Status do Pedido</span>
                  <span className={`ticket-badge-status ${obterClasseStatus(pedidoModal.status)}`}>
                    {obterStatus(pedidoModal.status)}
                  </span>
                </div>

                <div className="pedido-modal-total-card pagamento">
                  <span className="mod-tot-label">Pagamento</span>
                  <span
                    className={`ticket-badge-pagamento ${obterClassePagamento(
                      formatarStatusPagamento(pedidoModal.status_pagamento)
                    )}`}
                  >
                    ● {formatarStatusPagamento(pedidoModal.status_pagamento)}
                  </span>
                  <small className="mod-tot-sub">
                    {pedidoModal.forma_pagamento || 'Não informada'}
                  </small>
                </div>

                <div className="pedido-modal-total-card valor">
                  <span className="mod-tot-label">Total Real da Compra</span>
                  <span className="mod-tot-valor">
                    {formatarPreco(
                      obterTotalPedido(pedidoModal, obterProdutos(pedidoModal))
                    )}
                  </span>
                  <small className="mod-tot-sub">
                    {obterProdutos(pedidoModal).length} item(ns)
                  </small>
                </div>
              </div>

              {/* 2. GRID EM 2 COLUNAS: ITENS + FINANCEIRO & ENTREGA + GESTÃO ADMIN */}
              <div className="pedido-modal-grid-conteudo">
                {/* COLUNA ESQUERDA: ITENS E RESUMO FINANCEIRO */}
                <div className="pedido-modal-coluna">
                  <div className="pedido-modal-secao">
                    <h3 className="pedido-modal-secao-titulo">
                      <span>👗 Itens Comprados</span>
                      <span className="badge-qtd-itens">
                        {obterProdutos(pedidoModal).length} produto(s)
                      </span>
                    </h3>

                    <div className="pedido-modal-lista-itens">
                      {obterProdutos(pedidoModal).length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                          Nenhum item detalhado neste pedido.
                        </p>
                      ) : (
                        obterProdutos(pedidoModal).map((item, itemIdx) => {
                          const precoUnitario = Number(
                            item.preco ?? item.venda ?? item.valor ?? 0
                          )
                          const qtd = Number(item.quantidade || 1)
                          const sub = Number(item.subtotal || precoUnitario * qtd)
                          const foto =
                            item.foto ||
                            item.imagem ||
                            item.foto_url ||
                            item.imagem_url ||
                            null

                          return (
                            <div
                              key={item.id || `${item.nome}-${itemIdx}`}
                              className="modal-item-linha"
                            >
                              <div className="modal-item-foto">
                                {foto ? (
                                  <img src={foto} alt={item.nome} loading="lazy" />
                                ) : (
                                  <span>👗</span>
                                )}
                              </div>

                              <div className="modal-item-info">
                                <strong className="modal-item-nome">
                                  {item.nome || item.produto_nome || 'Produto'}
                                </strong>

                                <div className="modal-item-tags">
                                  {item.cor && (
                                    <span className="spec-tag">
                                      Cor: <strong>{item.cor}</strong>
                                    </span>
                                  )}
                                  <span className="spec-tag">
                                    Tam: <strong>{item.tamanho || item.tamanho_nome || '-'}</strong>
                                  </span>
                                  {item.sku && (
                                    <span className="spec-tag sku">
                                      SKU: {item.sku}
                                    </span>
                                  )}
                                </div>

                                <div className="modal-item-valores">
                                  <span>
                                    {qtd}x de {formatarPreco(precoUnitario)}
                                  </span>
                                  <strong>= {formatarPreco(sub)}</strong>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* RESUMO FINANCEIRO HISTÓRICO */}
                    <div className="modal-resumo-financeiro">
                      <h4>Resumo Financeiro Gravado</h4>
                      {pedidoModal.subtotal !== undefined && Number(pedidoModal.subtotal) > 0 && (
                        <div className="modal-fin-linha">
                          <span>Subtotal dos produtos:</span>
                          <strong>{formatarPreco(pedidoModal.subtotal)}</strong>
                        </div>
                      )}
                      {pedidoModal.valor_frete !== undefined && (
                        <div className="modal-fin-linha">
                          <span>Frete:</span>
                          <strong>
                            {Number(pedidoModal.valor_frete) > 0
                              ? formatarPreco(pedidoModal.valor_frete)
                              : 'Grátis'}
                          </strong>
                        </div>
                      )}
                      {pedidoModal.desconto !== undefined && Number(pedidoModal.desconto) > 0 && (
                        <div className="modal-fin-linha desconto">
                          <span>Desconto{pedidoModal.cupom ? ` (${pedidoModal.cupom})` : ''}:</span>
                          <strong>− {formatarPreco(pedidoModal.desconto)}</strong>
                        </div>
                      )}
                      <div className="modal-fin-linha total">
                        <span>Total do Pedido:</span>
                        <strong>
                          {formatarPreco(
                            obterTotalPedido(pedidoModal, obterProdutos(pedidoModal))
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA: ENTREGA + INFORMAÇÕES ADMINISTRATIVAS EDITÁVEIS */}
                <div className="pedido-modal-coluna">
                  {/* ENTREGA E LOGÍSTICA */}
                  <div className="pedido-modal-secao">
                    <h3 className="pedido-modal-secao-titulo">
                      <span>📍 Dados de Entrega & Cliente</span>
                    </h3>

                    <div className="modal-card-detalhes">
                      <div className="modal-info-linha">
                        <span className="info-rotulo">Origem:</span>
                        <span className="info-dado font-bold">
                          {pedidoModal.origem === 'venda_direta' ? '💬 Venda Direta (WhatsApp)' : '🌐 Loja Online'}
                        </span>
                      </div>

                      {pedidoModal.codigo_acompanhamento && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">Código Seguro:</span>
                          <span className="info-dado font-bold" style={{ color: '#b76e79', fontFamily: 'monospace' }}>
                            {pedidoModal.codigo_acompanhamento}
                          </span>
                        </div>
                      )}

                      {pedidoModal.atendente && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">Atendente:</span>
                          <span className="info-dado font-bold">
                            {pedidoModal.atendente}
                          </span>
                        </div>
                      )}

                      <div className="modal-info-linha">
                        <span className="info-rotulo">Cliente:</span>
                        <span className="info-dado font-bold">
                          {obterNomeCliente(pedidoModal)}
                        </span>
                      </div>

                      {(pedidoModal.email_cliente || pedidoModal.email) && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">E-mail:</span>
                          <span className="info-dado">
                            {pedidoModal.email_cliente || pedidoModal.email}
                          </span>
                        </div>
                      )}

                      {(pedidoModal.telefone_cliente || pedidoModal.telefone) && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">Telefone:</span>
                          <span className="info-dado">
                            {pedidoModal.telefone_cliente || pedidoModal.telefone}
                          </span>
                        </div>
                      )}

                      {(pedidoModal.cpf_cliente || pedidoModal.cpf) && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">CPF:</span>
                          <span className="info-dado">
                            {pedidoModal.cpf_cliente || pedidoModal.cpf}
                          </span>
                        </div>
                      )}

                      <div className="modal-info-linha">
                        <span className="info-rotulo">Endereço:</span>
                        <span className="info-dado">
                          {[
                            pedidoModal.endereco_entrega,
                            pedidoModal.numero_entrega,
                            pedidoModal.complemento_entrega,
                            pedidoModal.bairro_entrega,
                            pedidoModal.cidade_entrega && pedidoModal.estado_entrega
                              ? `${pedidoModal.cidade_entrega} - ${pedidoModal.estado_entrega}`
                              : pedidoModal.cidade_entrega || pedidoModal.estado_entrega
                          ]
                            .filter(Boolean)
                            .join(', ') || 'Retirada / Não informado'}
                        </span>
                      </div>

                      {pedidoModal.cep_entrega && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">CEP:</span>
                          <span className="info-dado">{pedidoModal.cep_entrega}</span>
                        </div>
                      )}

                      {(pedidoModal.transportadora || pedidoModal.servico_frete) && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">Serviço de Frete:</span>
                          <span className="info-dado">
                            {pedidoModal.transportadora || pedidoModal.servico_frete}
                          </span>
                        </div>
                      )}

                      {pedidoModal.prazo_frete && (
                        <div className="modal-info-linha">
                          <span className="info-rotulo">Prazo Estimado:</span>
                          <span className="info-dado">{pedidoModal.prazo_frete}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* FORMULÁRIO DE GESTÃO ADMINISTRATIVA EDITÁVEL */}
                  <div className="pedido-modal-secao">
                    <h3 className="pedido-modal-secao-titulo">
                      <span>⚙️ Gestão Administrativa & Status</span>
                    </h3>

                    {mensagemSucesso && (
                      <div
                        style={{
                          background: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          marginBottom: '14px',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}
                      >
                        {mensagemSucesso}
                      </div>
                    )}

                    <form
                      className="modal-form-administrativo"
                      onSubmit={handleSalvarEdicaoModal}
                    >
                      <div className="form-grupo">
                        <label htmlFor="edicao-status-pedido">
                          <strong>Status Operacional do Pedido:</strong>
                        </label>
                        <select
                          id="edicao-status-pedido"
                          value={formEdicao.status}
                          onChange={(e) =>
                            setFormEdicao((prev) => ({ ...prev, status: e.target.value }))
                          }
                          style={{
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1.5px solid #b76e79',
                            background: '#ffffff',
                            color: '#1e293b'
                          }}
                        >
                          {opcoesStatusModal.map((st) => (
                            <option key={st} value={st}>
                              {st === 'Pedido recebido' && '📦 Pedido recebido'}
                              {st === 'Em preparação' && '✂️ Em preparação'}
                              {st === 'Enviado' && '🚚 Enviado'}
                              {st === 'Pronto para retirada' && '🏬 Pronto para retirada'}
                              {st === 'Entregue' && '✅ Entregue'}
                              {st === 'Cancelado' && '❌ Cancelado'}
                              {!['Pedido recebido', 'Em preparação', 'Enviado', 'Pronto para retirada', 'Entregue', 'Cancelado'].includes(st) && st}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Botões rápidos de status */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                        {[
                          { valor: 'Pedido recebido', rotulo: '📦 Pedido recebido' },
                          { valor: 'Em preparação', rotulo: '✂️ Em preparação' },
                          { valor: 'Enviado', rotulo: '🚚 Enviado' },
                          { valor: 'Pronto para retirada', rotulo: '🏬 Pronto para retirada' },
                          { valor: 'Entregue', rotulo: '✅ Entregue' }
                        ].map((item) => {
                          const ativo = formEdicao.status === item.valor
                          return (
                            <button
                              key={item.valor}
                              type="button"
                              onClick={() => setFormEdicao((prev) => ({ ...prev, status: item.valor }))}
                              style={{
                                border: ativo ? '1.5px solid #b76e79' : '1px solid #cbd5e1',
                                background: ativo ? '#b76e79' : '#f8fafc',
                                color: ativo ? '#ffffff' : '#334155',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontSize: '0.76rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {item.rotulo}
                            </button>
                          )
                        })}
                      </div>

                      <div className="form-duplo">
                        <div className="form-grupo">
                          <label htmlFor="edicao-transportadora">Transportadora:</label>
                          <input
                            id="edicao-transportadora"
                            type="text"
                            placeholder="Ex: Correios, Jadlog, Loggi"
                            value={formEdicao.transportadora}
                            onChange={(e) =>
                              setFormEdicao((prev) => ({
                                ...prev,
                                transportadora: e.target.value
                              }))
                            }
                          />
                        </div>

                        <div className="form-grupo">
                          <label htmlFor="edicao-codigo-rastreio">Código de Rastreio:</label>
                          <input
                            id="edicao-codigo-rastreio"
                            type="text"
                            placeholder="Ex: BR123456789"
                            value={formEdicao.codigoRastreio}
                            onChange={(e) =>
                              setFormEdicao((prev) => ({
                                ...prev,
                                codigoRastreio: e.target.value
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="form-grupo">
                        <label htmlFor="edicao-url-rastreio">Link de Acompanhamento (HTTPS):</label>
                        <input
                          id="edicao-url-rastreio"
                          type="url"
                          placeholder="https://rastreio.exemplo.com/..."
                          value={formEdicao.urlRastreio}
                          onChange={(e) =>
                            setFormEdicao((prev) => ({
                              ...prev,
                              urlRastreio: e.target.value
                            }))
                          }
                        />
                      </div>

                      <div className="form-grupo">
                        <label htmlFor="edicao-observacao-interna">
                          Observação Interna (Admin / Loja):
                        </label>
                        <textarea
                          id="edicao-observacao-interna"
                          rows={3}
                          placeholder="Anotações internas sobre separação, contato com a cliente, notas fiscais, etc..."
                          value={formEdicao.observacaoInterna}
                          onChange={(e) =>
                            setFormEdicao((prev) => ({
                              ...prev,
                              observacaoInterna: e.target.value
                            }))
                          }
                        />
                        <small style={{ color: '#94a3b8', fontSize: '0.74rem' }}>
                          Esta anotação é interna e não é exibida para a cliente no acompanhamento.
                        </small>
                      </div>

                      <div className="modal-acoes-footer">
                        {pedidoModal.origem === 'venda_direta' && formatarStatusPagamento(pedidoModal.status_pagamento) !== 'Pago' && (
                          <button
                            type="button"
                            className="btn-modal-confirmar-pix"
                            disabled={salvandoEdicao}
                            onClick={handleConfirmarPixVendaDireta}
                            title="Confirmar recebimento do Pix desta Venda Direta"
                          >
                            ✓ Confirmar Pagamento Pix
                          </button>
                        )}

                        {ehPedidoDeTeste(pedidoModal) && (
                          <button
                            type="button"
                            className="btn-modal-remover-teste"
                            disabled={salvandoEdicao}
                            onClick={() => handleRemoverPedidoTeste(pedidoModal)}
                          >
                            🗑️ Excluir Teste
                          </button>
                        )}

                        <button
                          type="submit"
                          className="btn-modal-salvar-alteracoes"
                          disabled={salvandoEdicao}
                        >
                          {salvandoEdicao ? 'Salvando...' : '💾 Salvar Alterações'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Pedidos

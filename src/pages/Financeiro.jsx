import { useCallback, useEffect, useMemo, useState } from 'react'
import { obterDataLocalHoje } from '../lib/dataLocal.js'
import {
  carregarSocios,
  salvarSocio,
  carregarAportes,
  salvarAporte,
  carregarRetiradas,
  salvarRetirada,
  carregarDespesas,
  salvarDespesa,
  removerDespesa,
  carregarCategoriasDespesa,
  carregarPedidos,
  carregarProdutos,
  carregarRemessas
} from '../storage'
import {
  calcularMetricasFinanceiras,
  montarExtratoFinanceiro,
  formatarMoeda,
  formatarPorcentagem,
  PERIODOS
} from './financeiroHelpers'
import './Financeiro.css'

function Financeiro({ papelUsuario: _papelUsuario, usuarioLogado: _usuarioLogado }) {
  const [carregando, setCarregando] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('geral') // 'geral', 'socios', 'despesas', 'extrato'

  // Dados brutos do banco
  const [socios, setSocios] = useState([])
  const [aportes, setAportes] = useState([])
  const [retiradas, setRetiradas] = useState([])
  const [despesas, setDespesas] = useState([])
  const [categoriasDespesa, setCategoriasDespesa] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [produtos, setProdutos] = useState([])
  const [revendas, setRevendas] = useState([])

  // Filtros de período
  const [tipoPeriodo, setTipoPeriodo] = useState(PERIODOS.ESTE_MES)
  const [dataInicioCustom, setDataInicioCustom] = useState('')
  const [dataFimCustom, setDataFimCustom] = useState('')

  // Filtros do extrato
  const [filtroTipoExtrato, setFiltroTipoExtrato] = useState('todos')
  const [filtroOrigemExtrato, setFiltroOrigemExtrato] = useState('todos')
  const [filtroCategoriaExtrato, setFiltroCategoriaExtrato] = useState('todos')
  const [buscaExtrato, setBuscaExtrato] = useState('')

  // Modais
  const [modalSocioAberto, setModalSocioAberto] = useState(false)
  const [socioEmEdicao, setSocioEmEdicao] = useState(null)
  const [modalAporteAberto, setModalAporteAberto] = useState(false)
  const [socioSelecionadoAporte, setSocioSelecionadoAporte] = useState('')
  const [modalRetiradaAberto, setModalRetiradaAberto] = useState(false)
  const [socioSelecionadoRetirada, setSocioSelecionadoRetirada] = useState('')
  const [modalDespesaAberto, setModalDespesaAberto] = useState(false)
  const [despesaEmEdicao, setDespesaEmEdicao] = useState(null)
  const [modalDetalheSocio, setModalDetalheSocio] = useState(null)

  // Forms de modais
  const [formSocio, setFormSocio] = useState({
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    participacao_percentual: '',
    data_entrada: obterDataLocalHoje(),
    status: 'Ativo',
    observacao: ''
  })

  const [formAporte, setFormAporte] = useState({
    socio_id: '',
    valor: '',
    data: obterDataLocalHoje(),
    rodada_numero: 1,
    rodada_nome: 'Aporte 1',
    finalidade: 'Compra de mercadoria',
    forma_pagamento: 'Pix',
    observacao: ''
  })

  const [filtroRodadaAporte, setFiltroRodadaAporte] = useState('todas')

  const [formRetirada, setFormRetirada] = useState({
    socio_id: '',
    valor: '',
    data: obterDataLocalHoje(),
    tipo: 'Distribuição de lucro',
    forma_pagamento: 'Pix',
    observacao: ''
  })

  const [formDespesa, setFormDespesa] = useState({
    descricao: '',
    categoria: 'Outros',
    valor: '',
    data: obterDataLocalHoje(),
    forma_pagamento: 'Pix',
    observacao: ''
  })

  const [salvando, setSalvando] = useState(false)
  const [mensagemFeedback, setMensagemFeedback] = useState('')

  // Carregar todos os dados necessários de forma atômica
  const carregarDadosFinanceiros = useCallback(async () => {
    try {
      setCarregando(true)
      const [
        sociosRes,
        aportesRes,
        retiradasRes,
        despesasRes,
        categoriasRes,
        pedidosRes,
        produtosRes,
        remessasRes
      ] = await Promise.all([
        carregarSocios(),
        carregarAportes(),
        carregarRetiradas(),
        carregarDespesas(),
        carregarCategoriasDespesa(),
        carregarPedidos(),
        carregarProdutos(true),
        carregarRemessas()
      ])

      setSocios(sociosRes || [])
      setAportes(aportesRes || [])
      setRetiradas(retiradasRes || [])
      setDespesas(despesasRes || [])
      setCategoriasDespesa(categoriasRes || [])
      setPedidos(pedidosRes || [])
      setProdutos(produtosRes || [])
      setRevendas(remessasRes || [])
    } catch (erro) {
      console.error('Erro ao carregar dados do módulo financeiro:', erro)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregarDadosFinanceiros()
  }, [carregarDadosFinanceiros])

  // Métricas financeiras calculadas
  const metricas = useMemo(() => {
    return calcularMetricasFinanceiras({
      socios,
      aportes,
      retiradas,
      despesas,
      pedidos,
      produtos,
      revendas,
      tipoPeriodo,
      dataInicioCustom,
      dataFimCustom
    })
  }, [
    socios,
    aportes,
    retiradas,
    despesas,
    pedidos,
    produtos,
    revendas,
    tipoPeriodo,
    dataInicioCustom,
    dataFimCustom
  ])

  // Extrato unificado de movimentações
  const extrato = useMemo(() => {
    return montarExtratoFinanceiro({
      aportes,
      retiradas,
      despesas,
      pedidos,
      revendas,
      filtroTipo: filtroTipoExtrato,
      filtroOrigem: filtroOrigemExtrato,
      filtroCategoria: filtroCategoriaExtrato,
      busca: buscaExtrato
    })
  }, [
    aportes,
    retiradas,
    despesas,
    pedidos,
    revendas,
    filtroTipoExtrato,
    filtroOrigemExtrato,
    filtroCategoriaExtrato,
    buscaExtrato
  ])

  // Feedback temporário
  const exibirFeedback = (msg) => {
    setMensagemFeedback(msg)
    setTimeout(() => setMensagemFeedback(''), 4000)
  }

  // Handlers de Sócios
  const abrirModalNovoSocio = () => {
    setSocioEmEdicao(null)
    setFormSocio({
      nome: '',
      cpf: '',
      email: '',
      telefone: '',
      participacao_percentual: '',
      data_entrada: obterDataLocalHoje(),
      status: 'Ativo',
      observacao: ''
    })
    setModalSocioAberto(true)
  }

  const abrirModalEditarSocio = (socio) => {
    setSocioEmEdicao(socio)
    setFormSocio({
      nome: socio.nome || '',
      cpf: socio.cpf || '',
      email: socio.email || '',
      telefone: socio.telefone || '',
      participacao_percentual: socio.participacao_percentual ?? '',
      data_entrada: socio.data_entrada || obterDataLocalHoje(),
      status: socio.status || 'Ativo',
      observacao: socio.observacao || ''
    })
    setModalSocioAberto(true)
  }

  const handleSalvarSocio = async (e) => {
    e.preventDefault()
    if (!formSocio.nome.trim()) {
      alert('Nome do sócio é obrigatório.')
      return
    }

    try {
      setSalvando(true)
      const payload = {
        ...formSocio,
        id: socioEmEdicao?.id || undefined
      }
      const res = await salvarSocio(payload)
      if (!res.sucesso) throw new Error(res.mensagem)

      setModalSocioAberto(false)
      exibirFeedback('✓ Sócio salvo com sucesso!')
      await carregarDadosFinanceiros()
    } catch (erro) {
      alert(erro.message || 'Erro ao salvar sócio.')
    } finally {
      setSalvando(false)
    }
  }

  // Rodadas de Aporte Helpers
  const rodadasDisponiveis = useMemo(() => {
    if (!metricas.rodadas || metricas.rodadas.length === 0) {
      return [{ rodada_numero: 1, rodada_nome: 'Aporte 1', total: 0, quantidadeLancamentos: 0, aportes: [] }]
    }
    return metricas.rodadas
  }, [metricas.rodadas])

  const proximaRodadaNumero = useMemo(() => {
    if (!metricas.rodadas || metricas.rodadas.length === 0) return 2
    const maxNum = Math.max(...metricas.rodadas.map((r) => Number(r.rodada_numero) || 1), 1)
    return maxNum + 1
  }, [metricas.rodadas])

  const listaRodadasSelect = useMemo(() => {
    const lista = [...rodadasDisponiveis]
    const jaExiste = lista.some((r) => Number(r.rodada_numero) === Number(formAporte.rodada_numero))
    if (!jaExiste && formAporte.rodada_numero) {
      lista.push({
        rodada_numero: Number(formAporte.rodada_numero),
        rodada_nome: formAporte.rodada_nome || `Aporte ${formAporte.rodada_numero}`,
        total: 0,
        quantidadeLancamentos: 0,
        ehNova: true
      })
      lista.sort((a, b) => a.rodada_numero - b.rodada_numero)
    }
    return lista
  }, [rodadasDisponiveis, formAporte.rodada_numero, formAporte.rodada_nome])

  // Handlers de Aporte
  const abrirModalNovoAporte = (socioId = '', rodadaNumPadrao = null) => {
    const idSocio = socioId ? String(socioId) : (socios[0]?.id ? String(socios[0].id) : '')
    const ultRodada = metricas.rodadas?.[metricas.rodadas.length - 1]
    const numRodada = rodadaNumPadrao || ultRodada?.rodada_numero || 1
    const nomeRodada = ultRodada?.rodada_nome || `Aporte ${numRodada}`

    setSocioSelecionadoAporte(idSocio)
    setFormAporte({
      socio_id: idSocio,
      valor: '',
      data: obterDataLocalHoje(),
      rodada_numero: numRodada,
      rodada_nome: nomeRodada,
      finalidade: 'Compra de mercadoria',
      forma_pagamento: 'Pix',
      observacao: ''
    })
    setModalAporteAberto(true)
  }

  const handleSalvarAporte = async (e) => {
    e.preventDefault()
    const valorNum = Number(formAporte.valor)
    if (!formAporte.socio_id || valorNum <= 0 || Number.isNaN(valorNum)) {
      alert('Selecione o sócio e informe um valor de aporte válido.')
      return
    }

    try {
      setSalvando(true)
      const res = await salvarAporte(formAporte)
      if (!res.sucesso) throw new Error(res.mensagem)

      setModalAporteAberto(false)
      exibirFeedback('✓ Aporte registrado com sucesso!')
      await carregarDadosFinanceiros()
    } catch (erro) {
      alert(erro.message || 'Erro ao registrar aporte.')
    } finally {
      setSalvando(false)
    }
  }

  // Handlers de Retirada
  const abrirModalNovaRetirada = (socioId = '') => {
    setSocioSelecionadoRetirada(socioId ? String(socioId) : (socios[0]?.id ? String(socios[0].id) : ''))
    setFormRetirada({
      socio_id: socioId ? String(socioId) : (socios[0]?.id ? String(socios[0].id) : ''),
      valor: '',
      data: obterDataLocalHoje(),
      tipo: 'Distribuição de lucro',
      forma_pagamento: 'Pix',
      observacao: ''
    })
    setModalRetiradaAberto(true)
  }

  const handleSalvarRetirada = async (e) => {
    e.preventDefault()
    const valorNum = Number(formRetirada.valor)
    if (!formRetirada.socio_id || valorNum <= 0 || Number.isNaN(valorNum)) {
      alert('Selecione o sócio e informe um valor de retirada válido.')
      return
    }

    try {
      setSalvando(true)
      const res = await salvarRetirada(formRetirada)
      if (!res.sucesso) throw new Error(res.mensagem)

      setModalRetiradaAberto(false)
      exibirFeedback('✓ Retirada registrada com sucesso!')
      await carregarDadosFinanceiros()
    } catch (erro) {
      alert(erro.message || 'Erro ao registrar retirada.')
    } finally {
      setSalvando(false)
    }
  }

  // Handlers de Despesa
  const abrirModalNovaDespesa = () => {
    setDespesaEmEdicao(null)
    setFormDespesa({
      descricao: '',
      categoria: categoriasDespesa[0]?.nome || 'Outros',
      valor: '',
      data: obterDataLocalHoje(),
      forma_pagamento: 'Pix',
      observacao: ''
    })
    setModalDespesaAberto(true)
  }

  const abrirModalEditarDespesa = (d) => {
    setDespesaEmEdicao(d)
    setFormDespesa({
      descricao: d.descricao || '',
      categoria: d.categoria || 'Outros',
      valor: d.valor ?? '',
      data: d.data || obterDataLocalHoje(),
      forma_pagamento: d.forma_pagamento || 'Pix',
      observacao: d.observacao || ''
    })
    setModalDespesaAberto(true)
  }

  const handleSalvarDespesa = async (e) => {
    e.preventDefault()
    const valorNum = Number(formDespesa.valor)
    if (!formDespesa.descricao.trim() || valorNum <= 0 || Number.isNaN(valorNum)) {
      alert('Informe a descrição e um valor válido para a despesa.')
      return
    }

    try {
      setSalvando(true)
      const payload = {
        ...formDespesa,
        id: despesaEmEdicao?.id || undefined
      }
      const res = await salvarDespesa(payload)
      if (!res.sucesso) throw new Error(res.mensagem)

      setModalDespesaAberto(false)
      exibirFeedback('✓ Despesa salva com sucesso!')
      await carregarDadosFinanceiros()
    } catch (erro) {
      alert(erro.message || 'Erro ao salvar despesa.')
    } finally {
      setSalvando(false)
    }
  }

  const handleRemoverDespesa = async (id) => {
    if (!window.confirm('Confirma a exclusão desta despesa?')) return

    try {
      const res = await removerDespesa(id)
      if (!res.sucesso) throw new Error(res.mensagem)
      exibirFeedback('✓ Despesa removida!')
      await carregarDadosFinanceiros()
    } catch (erro) {
      alert(erro.message || 'Erro ao remover despesa.')
    }
  }

  return (
    <div className="financeiro-page">
      {/* CABEÇALHO DO MÓDULO */}
      <header className="financeiro-header">
        <div className="financeiro-header-title">
          <span className="financeiro-badge-tag">GESTÃO ESTRATÉGICA</span>
          <h1>Módulo Financeiro</h1>
          <p>Controle de sócios, aportes, faturamento automático, CMV, despesas e resultado.</p>
        </div>

        {/* CONTROLE DE PERÍODO */}
        <div className="financeiro-periodo-container">
          <span className="periodo-label">PERÍODO:</span>
          <div className="financeiro-periodo-botoes">
            <button
              type="button"
              className={tipoPeriodo === PERIODOS.HOJE ? 'ativo' : ''}
              onClick={() => setTipoPeriodo(PERIODOS.HOJE)}
            >
              Hoje
            </button>
            <button
              type="button"
              className={tipoPeriodo === PERIODOS.ESTE_MES ? 'ativo' : ''}
              onClick={() => setTipoPeriodo(PERIODOS.ESTE_MES)}
            >
              Este mês
            </button>
            <button
              type="button"
              className={tipoPeriodo === PERIODOS.MES_ANTERIOR ? 'ativo' : ''}
              onClick={() => setTipoPeriodo(PERIODOS.MES_ANTERIOR)}
            >
              Mês anterior
            </button>
            <button
              type="button"
              className={tipoPeriodo === PERIODOS.ESTE_ANO ? 'ativo' : ''}
              onClick={() => setTipoPeriodo(PERIODOS.ESTE_ANO)}
            >
              Este ano
            </button>
            <button
              type="button"
              className={tipoPeriodo === PERIODOS.PERSONALIZADO ? 'ativo' : ''}
              onClick={() => setTipoPeriodo(PERIODOS.PERSONALIZADO)}
            >
              Personalizado
            </button>
          </div>

          {tipoPeriodo === PERIODOS.PERSONALIZADO && (
            <div className="financeiro-periodo-custom">
              <input
                type="date"
                value={dataInicioCustom}
                onChange={(e) => setDataInicioCustom(e.target.value)}
                title="Data inicial"
              />
              <span>até</span>
              <input
                type="date"
                value={dataFimCustom}
                onChange={(e) => setDataFimCustom(e.target.value)}
                title="Data final"
              />
            </div>
          )}
        </div>
      </header>

      {/* FEEDBACK GLOBAL */}
      {mensagemFeedback && (
        <div className="financeiro-toast-feedback" role="status">
          {mensagemFeedback}
        </div>
      )}

      {/* CARDS INDICADORES DO TOPO */}
      <section className="financeiro-cards-grid" aria-label="Indicadores Financeiros Principais">
        {/* TOTAL APORTADO */}
        <div
          className="card-financeiro card-aportes"
          onClick={() => setAbaAtiva('socios')}
          title="Clique para ver sócios e aportes"
        >
          <div className="card-fin-header">
            <span className="card-fin-rotulo">TOTAL APORTADO</span>
            <span className="card-fin-badge">Sócios</span>
          </div>
          <strong className="card-fin-valor">{formatarMoeda(metricas.cards.totalAportado)}</strong>
          <small className="card-fin-sub">
            {metricas.socios.length} sócios cadastrados · {metricas.cards.totalAportadoPeriodo > 0 ? `+${formatarMoeda(metricas.cards.totalAportadoPeriodo)} no período` : 'Sem novo aporte no período'}
          </small>
        </div>

        {/* SALDO FINANCEIRO REGISTRADO */}
        <div
          className="card-financeiro card-saldo"
          onClick={() => setAbaAtiva('extrato')}
          title="Clique para ver o extrato de caixa"
        >
          <div className="card-fin-header">
            <span className="card-fin-rotulo">SALDO FINANCEIRO</span>
            <span className="card-fin-badge">{metricas.cards.saldoFinanceiro >= 0 ? 'Positivo' : 'Atenção'}</span>
          </div>
          <strong className={`card-fin-valor ${metricas.cards.saldoFinanceiro < 0 ? 'negativo' : ''}`}>
            {formatarMoeda(metricas.cards.saldoFinanceiro)}
          </strong>
          <small className="card-fin-sub">Saldo financeiro registrado no sistema</small>
        </div>

        {/* FATURAMENTO */}
        <div
          className="card-financeiro card-faturamento"
          onClick={() => setAbaAtiva('geral')}
          title="Clique para ver DRE detalhada"
        >
          <div className="card-fin-header">
            <span className="card-fin-rotulo">FATURAMENTO</span>
            <span className="card-fin-badge">{metricas.periodo.label}</span>
          </div>
          <strong className="card-fin-valor">{formatarMoeda(metricas.cards.faturamento)}</strong>
          <small className="card-fin-sub">
            Loja: {formatarMoeda(metricas.faturamentoDetalhado.lojaOnline)} · Zap: {formatarMoeda(metricas.faturamentoDetalhado.vendaDireta)} · Revendas: {formatarMoeda(metricas.faturamentoDetalhado.revendas)}
          </small>
        </div>

        {/* DESPESAS OPERACIONAIS */}
        <div
          className="card-financeiro card-despesas"
          onClick={() => setAbaAtiva('despesas')}
          title="Clique para ver despesas"
        >
          <div className="card-fin-header">
            <span className="card-fin-rotulo">DESPESAS</span>
            <span className="card-fin-badge">{metricas.periodo.label}</span>
          </div>
          <strong className="card-fin-valor">{formatarMoeda(metricas.cards.despesas)}</strong>
          <small className="card-fin-sub">
            {metricas.despesasPeriodo.length} lançamentos operacionais no período
          </small>
        </div>

        {/* RESULTADO OPERACIONAL */}
        <div
          className="card-financeiro card-resultado"
          onClick={() => setAbaAtiva('geral')}
          title="Clique para ver DRE e margens"
        >
          <div className="card-fin-header">
            <span className="card-fin-rotulo">RESULTADO</span>
            <span className="card-fin-badge">
              Margem {formatarPorcentagem(metricas.dre.margemLiquida)}
            </span>
          </div>
          <strong className={`card-fin-valor ${metricas.cards.resultado < 0 ? 'negativo' : 'positivo'}`}>
            {formatarMoeda(metricas.cards.resultado)}
          </strong>
          <small className="card-fin-sub">
            Lucro Bruto: {formatarMoeda(metricas.dre.lucroBruto)} (Margem {formatarPorcentagem(metricas.dre.margemBruta)})
          </small>
        </div>

        {/* VALOR DO ESTOQUE A CUSTO */}
        <div
          className="card-financeiro card-estoque"
          onClick={() => setAbaAtiva('geral')}
          title="Patrimônio em mercadorias a custo"
        >
          <div className="card-fin-header">
            <span className="card-fin-rotulo">ESTOQUE A CUSTO</span>
            <span className="card-fin-badge">{metricas.patrimonioEstoque.totalPecas} peças</span>
          </div>
          <strong className="card-fin-valor">{formatarMoeda(metricas.cards.estoqueCusto)}</strong>
          <small className="card-fin-sub">
            Loja: {formatarMoeda(metricas.patrimonioEstoque.lojaCusto)} · Consignado: {formatarMoeda(metricas.patrimonioEstoque.consignadoCusto)}
          </small>
        </div>
      </section>

      {/* ABAS DE NAVEGAÇÃO INTERNA */}
      <nav className="financeiro-tabs-nav">
        <button
          type="button"
          className={`tab-btn ${abaAtiva === 'geral' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('geral')}
        >
          📊 Visão Geral & DRE
        </button>
        <button
          type="button"
          className={`tab-btn ${abaAtiva === 'socios' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('socios')}
        >
          👥 Sócios & Aportes ({socios.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${abaAtiva === 'despesas' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('despesas')}
        >
          💸 Despesas ({despesas.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${abaAtiva === 'extrato' ? 'ativo' : ''}`}
          onClick={() => setAbaAtiva('extrato')}
        >
          📜 Extrato / Movimentações ({extrato.length})
        </button>
      </nav>

      {/* CONTEÚDO DA ABA SELECIONADA */}
      {carregando ? (
        <div className="financeiro-carregando">
          <div className="loading-spinner">⏳</div>
          <strong>Carregando dados financeiros...</strong>
        </div>
      ) : (
        <main className="financeiro-conteudo-aba">
          {/* ========================================================================= */}
          {/* ABA 1: VISÃO GERAL & DRE */}
          {/* ========================================================================= */}
          {abaAtiva === 'geral' && (
            <section className="aba-visao-geral">
              <div className="financeiro-grid-dre">
                {/* DEMONSTRATIVO DO RESULTADO (DRE) */}
                <article className="painel-card dre-card">
                  <div className="painel-header">
                    <h2>Demonstrativo do Resultado ({metricas.periodo.label})</h2>
                    <span className="painel-sub">Regra de Competência e Custo Histórico</span>
                  </div>

                  <div className="dre-tabela">
                    <div className="dre-linha destaque">
                      <span>(+) Faturamento Bruto</span>
                      <strong>{formatarMoeda(metricas.dre.faturamentoBruto)}</strong>
                    </div>

                    <div className="dre-linha-sub">
                      <span>• Loja Online</span>
                      <span>{formatarMoeda(metricas.faturamentoDetalhado.lojaOnline)}</span>
                    </div>
                    <div className="dre-linha-sub">
                      <span>• Venda Direta (WhatsApp)</span>
                      <span>{formatarMoeda(metricas.faturamentoDetalhado.vendaDireta)}</span>
                    </div>
                    <div className="dre-linha-sub">
                      <span>• Revendas (Líquido Loja)</span>
                      <span>{formatarMoeda(metricas.faturamentoDetalhado.revendas)}</span>
                    </div>

                    <div className="dre-linha subtrair">
                      <span>(−) Custo das Mercadorias Vendidas (CMV)</span>
                      <strong>{formatarMoeda(metricas.dre.cmv)}</strong>
                    </div>

                    <div className="dre-linha total-parcial">
                      <span>(=) Lucro Bruto</span>
                      <div className="dre-total-col">
                        <strong>{formatarMoeda(metricas.dre.lucroBruto)}</strong>
                        <small>Margem Bruta: {formatarPorcentagem(metricas.dre.margemBruta)}</small>
                      </div>
                    </div>

                    <div className="dre-linha subtrair">
                      <span>(−) Despesas Operacionais</span>
                      <strong>{formatarMoeda(metricas.dre.despesasOperacionais)}</strong>
                    </div>

                    <div className="dre-linha total-final">
                      <span>(=) Resultado Operacional / Lucro Líquido</span>
                      <div className="dre-total-col">
                        <strong className={metricas.dre.resultadoOperacional >= 0 ? 'positivo' : 'negativo'}>
                          {formatarMoeda(metricas.dre.resultadoOperacional)}
                        </strong>
                        <small>Margem Líquida: {formatarPorcentagem(metricas.dre.margemLiquida)}</small>
                      </div>
                    </div>
                  </div>
                </article>

                {/* PATRIMÔNIO & FLUXO DE CAIXA */}
                <article className="painel-card patrimonio-card">
                  <div className="painel-header">
                    <h2>Patrimônio & Estoque a Custo</h2>
                    <span className="painel-sub">Valor investido em mercadorias ativas</span>
                  </div>

                  <div className="patrimonio-estatisticas">
                    <div className="patrimonio-item">
                      <div className="patrimonio-icon">🏬</div>
                      <div>
                        <span>Estoque Físico na Loja</span>
                        <strong>{formatarMoeda(metricas.patrimonioEstoque.lojaCusto)}</strong>
                        <small>{metricas.patrimonioEstoque.pecasLoja} peças em estoque</small>
                      </div>
                    </div>

                    <div className="patrimonio-item">
                      <div className="patrimonio-icon">🤝</div>
                      <div>
                        <span>Estoque Consignado (Revendas)</span>
                        <strong>{formatarMoeda(metricas.patrimonioEstoque.consignadoCusto)}</strong>
                        <small>{metricas.patrimonioEstoque.pecasConsignado} peças em consignação</small>
                      </div>
                    </div>

                    <div className="patrimonio-item total">
                      <div className="patrimonio-icon">💼</div>
                      <div>
                        <span>Patrimônio Total em Mercadorias</span>
                        <strong>{formatarMoeda(metricas.patrimonioEstoque.totalCusto)}</strong>
                        <small>{metricas.patrimonioEstoque.totalPecas} peças no total</small>
                      </div>
                    </div>
                  </div>

                  <div className="caixa-resumo-bloco">
                    <h3>Fluxo de Caixa ({metricas.periodo.label})</h3>
                    <div className="caixa-linha">
                      <span>Entradas no período (Vendas + Aportes):</span>
                      <strong>+{formatarMoeda(metricas.fluxoCaixa.entradasPeriodo)}</strong>
                    </div>
                    <div className="caixa-linha">
                      <span>Saídas no período (Despesas + Retiradas):</span>
                      <strong>−{formatarMoeda(metricas.fluxoCaixa.saidasPeriodo)}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: SÓCIOS & APORTES */}
          {/* ========================================================================= */}
          {abaAtiva === 'socios' && (
            <section className="aba-socios">
              <div className="secao-acoes-bar">
                <div>
                  <h2>Quadro Societário & Aportes</h2>
                  <p>Controle de investimentos por sócio, histórico de aportes e retiradas.</p>
                </div>
                <div className="acoes-botoes-grupo">
                  <button type="button" className="btn-fin-secundario" onClick={() => abrirModalNovoAporte()}>
                    + Novo Aporte
                  </button>
                  <button type="button" className="btn-fin-secundario" onClick={() => abrirModalNovaRetirada()}>
                    + Nova Retirada
                  </button>
                  <button type="button" className="btn-fin-primario" onClick={abrirModalNovoSocio}>
                    + Cadastrar Sócio
                  </button>
                </div>
              </div>

              {socios.length === 0 ? (
                <div className="financeiro-vazio">
                  <p>Nenhum sócio cadastrado ainda.</p>
                  <button type="button" className="btn-fin-primario" onClick={abrirModalNovoSocio}>
                    Cadastrar Primeiro Sócio
                  </button>
                </div>
              ) : (
                <div className="financeiro-tabela-wrapper">
                  <table className="financeiro-tabela">
                    <thead>
                      <tr>
                        <th>Sócio</th>
                        <th>Participação</th>
                        <th>Data Entrada</th>
                        <th>Total Aportado</th>
                        <th>Total Retirado</th>
                        <th>Saldo de Aportes</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricas.socios.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.nome}</strong>
                            {s.email && <small className="d-block">{s.email}</small>}
                          </td>
                          <td>{formatarPorcentagem(s.participacao_percentual)}</td>
                          <td>{s.data_entrada ? new Date(s.data_entrada).toLocaleDateString('pt-BR') : '—'}</td>
                          <td><strong className="text-aportado">{formatarMoeda(s.totalAportado)}</strong></td>
                          <td><span className="text-retirado">{formatarMoeda(s.totalRetirado)}</span></td>
                          <td><strong>{formatarMoeda(s.saldoHistorico)}</strong></td>
                          <td>
                            <span className={`status-badge-socio ${s.status === 'Ativo' ? 'ativo' : 'inativo'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="tabela-acoes-cell">
                              <button
                                type="button"
                                className="btn-acao-icone"
                                title="Ver histórico completo"
                                onClick={() => setModalDetalheSocio(s)}
                              >
                                👁️ Histórico
                              </button>
                              <button
                                type="button"
                                className="btn-acao-icone"
                                title="+ Aporte para este sócio"
                                onClick={() => abrirModalNovoAporte(s.id)}
                              >
                                ➕ Aporte
                              </button>
                              <button
                                type="button"
                                className="btn-acao-icone"
                                title="Editar dados"
                                onClick={() => abrirModalEditarSocio(s)}
                              >
                                ✏️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ===================================================
                  SEÇÃO: RODADAS DE APORTE (INVESTIMENTOS)
              =================================================== */}
              {aportes.length > 0 && (
                <div style={{ marginTop: '36px' }}>
                  <div className="secao-acoes-bar">
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', color: '#1e293b' }}>
                        Rodadas de Aporte ({metricas.rodadas?.length || 1})
                      </h3>
                      <p>Visualização e controle agrupados por Rodada de Investimento (Aporte 1, Aporte 2...).</p>
                    </div>
                  </div>

                  {/* FILTRO CHIPS DE RODADA */}
                  <div className="rodadas-filtro-container">
                    <div className="rodadas-chips-wrap">
                      <button
                        type="button"
                        className={`rodada-chip-btn ${filtroRodadaAporte === 'todas' ? 'ativo' : ''}`}
                        onClick={() => setFiltroRodadaAporte('todas')}
                      >
                        Todas as Rodadas
                        <span className="rodada-chip-badge">{aportes.length}</span>
                      </button>

                      {metricas.rodadas?.map((r) => (
                        <button
                          type="button"
                          key={r.rodada_numero}
                          className={`rodada-chip-btn ${filtroRodadaAporte === String(r.rodada_numero) ? 'ativo' : ''}`}
                          onClick={() => setFiltroRodadaAporte(String(r.rodada_numero))}
                        >
                          {r.rodada_nome}
                          <span className="rodada-chip-badge">{r.quantidadeLancamentos}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CARDS RESUMO DE CADA RODADA */}
                  <div className="rodadas-resumo-grid">
                    {metricas.rodadas?.map((r) => (
                      <div
                        key={r.rodada_numero}
                        className={`rodada-resumo-card ${filtroRodadaAporte === String(r.rodada_numero) ? 'ativo' : ''}`}
                        onClick={() => setFiltroRodadaAporte(String(r.rodada_numero))}
                      >
                        <div className="rodada-card-titulo">{r.rodada_nome}</div>
                        <div className="rodada-card-total">{formatarMoeda(r.total)}</div>
                        <div className="rodada-card-sub">
                          {r.quantidadeLancamentos} {r.quantidadeLancamentos === 1 ? 'lançamento' : 'lançamentos'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* TABELA DE APORTES FILTRADOS PELA RODADA */}
                  {(() => {
                    const aportesFiltrados = filtroRodadaAporte === 'todas'
                      ? aportes
                      : aportes.filter((ap) => String(ap.rodada_numero || 1) === String(filtroRodadaAporte))

                    const totalRodadaFiltrada = aportesFiltrados.reduce(
                      (acc, ap) => acc + Number(ap.valor || 0),
                      0
                    )

                    const nomeRodadaAtual = filtroRodadaAporte === 'todas'
                      ? 'Todas as Rodadas'
                      : (metricas.rodadas?.find((r) => String(r.rodada_numero) === String(filtroRodadaAporte))?.rodada_nome || `Aporte ${filtroRodadaAporte}`)

                    return (
                      <div className="financeiro-tabela-wrapper">
                        <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ color: '#1e293b' }}>
                            Lançamentos: {nomeRodadaAtual} ({aportesFiltrados.length})
                          </strong>
                          <span style={{ fontWeight: '700', color: '#166534' }}>
                            Total: {formatarMoeda(totalRodadaFiltrada)}
                          </span>
                        </div>

                        <table className="financeiro-tabela">
                          <thead>
                            <tr>
                              <th>Rodada</th>
                              <th>Sócio</th>
                              <th>Data</th>
                              <th>Valor</th>
                              <th>Finalidade</th>
                              <th>Descrição / Observação</th>
                              <th>Forma</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aportesFiltrados.map((ap) => {
                              const socioRef = metricas.socios.find((s) => Number(s.id) === Number(ap.socio_id))
                              const rodadaRotulo = ap.rodada_nome || `Aporte ${ap.rodada_numero || 1}`
                              return (
                                <tr key={ap.id}>
                                  <td><strong>{rodadaRotulo}</strong></td>
                                  <td><strong>{ap.financeiro_socios?.nome || socioRef?.nome || 'Sócio'}</strong></td>
                                  <td>{ap.data ? new Date(ap.data).toLocaleDateString('pt-BR') : '—'}</td>
                                  <td><strong className="text-aportado">{formatarMoeda(ap.valor)}</strong></td>
                                  <td><span className="categoria-tag">{ap.finalidade || 'Compra de mercadoria'}</span></td>
                                  <td>{ap.observacao || '—'}</td>
                                  <td><small>{ap.forma_pagamento || 'Pix'}</small></td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: '#f8fafc', fontWeight: '800' }}>
                              <td colSpan={3}>
                                {filtroRodadaAporte === 'todas' ? 'TOTAL GERAL APORTADO' : `TOTAL ${nomeRodadaAtual.toUpperCase()}`}
                              </td>
                              <td className="text-aportado">{formatarMoeda(totalRodadaFiltrada)}</td>
                              <td colSpan={3}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  })()}
                </div>
              )}
            </section>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: DESPESAS */}
          {/* ========================================================================= */}
          {abaAtiva === 'despesas' && (
            <section className="aba-despesas">
              <div className="secao-acoes-bar">
                <div>
                  <h2>Despesas Operacionais & Gerais</h2>
                  <p>Lançamentos e controle de saídas financeiras da empresa.</p>
                </div>
                <button type="button" className="btn-fin-primario" onClick={abrirModalNovaDespesa}>
                  + Nova Despesa
                </button>
              </div>

              {despesas.length === 0 ? (
                <div className="financeiro-vazio">
                  <p>Nenhuma despesa lançada até o momento.</p>
                  <button type="button" className="btn-fin-primario" onClick={abrirModalNovaDespesa}>
                    Lançar Primeira Despesa
                  </button>
                </div>
              ) : (
                <div className="financeiro-tabela-wrapper">
                  <table className="financeiro-tabela">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Forma de Pagamento</th>
                        <th>Valor</th>
                        <th>Observações</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {despesas.map((d) => (
                        <tr key={d.id}>
                          <td>{d.data ? new Date(d.data).toLocaleDateString('pt-BR') : '—'}</td>
                          <td><strong>{d.descricao}</strong></td>
                          <td><span className="categoria-tag">{d.categoria}</span></td>
                          <td>{d.forma_pagamento || 'Pix'}</td>
                          <td><strong className="text-despesa">{formatarMoeda(d.valor)}</strong></td>
                          <td><small>{d.observacao || '—'}</small></td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="tabela-acoes-cell">
                              <button
                                type="button"
                                className="btn-acao-icone"
                                title="Editar"
                                onClick={() => abrirModalEditarDespesa(d)}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="btn-acao-icone perigo"
                                title="Excluir"
                                onClick={() => handleRemoverDespesa(d.id)}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ========================================================================= */}
          {/* ABA 4: EXTRATO / MOVIMENTAÇÕES */}
          {/* ========================================================================= */}
          {abaAtiva === 'extrato' && (
            <section className="aba-extrato">
              <div className="secao-acoes-bar">
                <div>
                  <h2>Extrato Financeiro Unificado</h2>
                  <p>Histórico cronológico consolidado de todas as entradas e saídas de caixa.</p>
                </div>
              </div>

              {/* FILTROS DO EXTRATO */}
              <div className="extrato-filtros-bar">
                <div className="extrato-busca-wrapper">
                  <input
                    type="text"
                    placeholder="Buscar por descrição, referência ou cliente..."
                    value={buscaExtrato}
                    onChange={(e) => setBuscaExtrato(e.target.value)}
                  />
                </div>

                <select
                  value={filtroTipoExtrato}
                  onChange={(e) => setFiltroTipoExtrato(e.target.value)}
                >
                  <option value="todos">Todos os tipos (Entradas e Saídas)</option>
                  <option value="entrada">Somente Entradas (+)</option>
                  <option value="saida">Somente Saídas (−)</option>
                </select>

                <select
                  value={filtroOrigemExtrato}
                  onChange={(e) => setFiltroOrigemExtrato(e.target.value)}
                >
                  <option value="todos">Todas as origens</option>
                  <option value="Loja Online">Loja Online</option>
                  <option value="Venda Direta">Venda Direta</option>
                  <option value="Revenda">Revendas</option>
                  <option value="Aporte">Aportes</option>
                  <option value="Despesa">Despesas</option>
                  <option value="Retirada">Retiradas</option>
                </select>

                <select
                  value={filtroCategoriaExtrato}
                  onChange={(e) => setFiltroCategoriaExtrato(e.target.value)}
                >
                  <option value="todos">Todas as categorias</option>
                  <option value="Venda de Mercadoria">Venda de Mercadoria</option>
                  <option value="Consignação">Consignação</option>
                  <option value="Aporte de Capital">Aporte de Capital</option>
                  <option value="Distribuição de lucro">Distribuição de Lucro</option>
                  {categoriasDespesa.map((cat) => (
                    <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                  ))}
                </select>
              </div>

              {extrato.length === 0 ? (
                <div className="financeiro-vazio">
                  <p>Nenhuma movimentação encontrada com os filtros atuais.</p>
                </div>
              ) : (
                <div className="financeiro-tabela-wrapper">
                  <table className="financeiro-tabela">
                    <thead>
                      <tr>
                        <th>Data / Hora</th>
                        <th>Tipo</th>
                        <th>Origem</th>
                        <th>Descrição / Referência</th>
                        <th>Categoria</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extrato.map((mov) => {
                        const ehEntrada = mov.tipo === 'entrada'
                        return (
                          <tr key={mov.id}>
                            <td>
                              <strong>{new Date(mov.data).toLocaleDateString('pt-BR')}</strong>
                              <small className="d-block">{new Date(mov.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
                            </td>
                            <td>
                              <span className={`tipo-mov-tag ${ehEntrada ? 'entrada' : 'saida'}`}>
                                {ehEntrada ? '▲ Entrada' : '▼ Saída'}
                              </span>
                            </td>
                            <td><span className="origem-tag">{mov.origem}</span></td>
                            <td>
                              <strong>{mov.descricao}</strong>
                              {mov.observacao && <small className="d-block text-muted">{mov.observacao}</small>}
                            </td>
                            <td><span className="categoria-tag">{mov.categoria}</span></td>
                            <td style={{ textAlign: 'right' }}>
                              <strong className={ehEntrada ? 'text-entrada' : 'text-saida'}>
                                {ehEntrada ? '+' : '−'} {formatarMoeda(mov.valor)}
                              </strong>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      )}

      {/* ===================================================
          MODAL: NOVO / EDITAR SÓCIO
      =================================================== */}
      {modalSocioAberto && (
        <div className="modal-financeiro-overlay">
          <div className="modal-financeiro-card">
            <div className="modal-fin-header">
              <h3>{socioEmEdicao ? 'Editar Sócio' : 'Cadastrar Novo Sócio'}</h3>
              <button type="button" className="btn-fechar-modal" onClick={() => setModalSocioAberto(false)}>✕</button>
            </div>

            <form onSubmit={handleSalvarSocio} className="modal-fin-form">
              <div className="form-grupo">
                <label>Nome Completo do Sócio *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={formSocio.nome}
                  onChange={(e) => setFormSocio({ ...formSocio, nome: e.target.value })}
                />
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Participação (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="Ex: 20"
                    value={formSocio.participacao_percentual}
                    onChange={(e) => setFormSocio({ ...formSocio, participacao_percentual: e.target.value })}
                  />
                </div>
                <div className="form-grupo">
                  <label>Data de Entrada</label>
                  <input
                    type="date"
                    value={formSocio.data_entrada}
                    onChange={(e) => setFormSocio({ ...formSocio, data_entrada: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>E-mail</label>
                  <input
                    type="email"
                    placeholder="socio@exemplo.com"
                    value={formSocio.email}
                    onChange={(e) => setFormSocio({ ...formSocio, email: e.target.value })}
                  />
                </div>
                <div className="form-grupo">
                  <label>Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    placeholder="(11) 99999-8888"
                    value={formSocio.telefone}
                    onChange={(e) => setFormSocio({ ...formSocio, telefone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grupo">
                <label>Status</label>
                <select
                  value={formSocio.status}
                  onChange={(e) => setFormSocio({ ...formSocio, status: e.target.value })}
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>

              <div className="form-grupo">
                <label>Observações</label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais..."
                  value={formSocio.observacao}
                  onChange={(e) => setFormSocio({ ...formSocio, observacao: e.target.value })}
                />
              </div>

              <div className="modal-fin-footer">
                <button type="button" className="btn-cancelar" onClick={() => setModalSocioAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-salvar" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar Sócio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: NOVO APORTE
      =================================================== */}
      {modalAporteAberto && (
        <div className="modal-financeiro-overlay">
          <div className="modal-financeiro-card">
            <div className="modal-fin-header">
              <h3>Registrar Novo Aporte de Sócio</h3>
              <button type="button" className="btn-fechar-modal" onClick={() => setModalAporteAberto(false)}>✕</button>
            </div>

            <form onSubmit={handleSalvarAporte} className="modal-fin-form">
              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Rodada do Aporte *</label>
                  <select
                    value={formAporte.rodada_numero}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'NOVA_RODADA') {
                        const novaNum = Math.max(proximaRodadaNumero, (Number(formAporte.rodada_numero) || 1) + 1)
                        setFormAporte((prev) => ({
                          ...prev,
                          rodada_numero: novaNum,
                          rodada_nome: `Aporte ${novaNum}`
                        }))
                      } else {
                        const num = Number(val)
                        const rEncontrada = rodadasDisponiveis.find((r) => Number(r.rodada_numero) === num)
                        setFormAporte((prev) => ({
                          ...prev,
                          rodada_numero: num,
                          rodada_nome: rEncontrada?.rodada_nome || `Aporte ${num}`
                        }))
                      }
                    }}
                  >
                    {listaRodadasSelect.map((r) => (
                      <option key={r.rodada_numero} value={r.rodada_numero}>
                        {r.rodada_nome} {r.ehNova ? '✨ (Nova Rodada)' : ''}
                      </option>
                    ))}
                    <option value="NOVA_RODADA">
                      + Criar nova rodada (Aporte {Math.max(proximaRodadaNumero, (Number(formAporte.rodada_numero) || 1) + 1)})
                    </option>
                  </select>
                </div>

                <div className="form-grupo">
                  <label>Sócio Investidor *</label>
                  <select
                    required
                    value={formAporte.socio_id || socioSelecionadoAporte}
                    onChange={(e) => setFormAporte({ ...formAporte, socio_id: e.target.value })}
                  >
                    <option value="">Selecione o sócio...</option>
                    {socios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome} {s.status === 'Inativo' ? '(Inativo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Valor do Aporte (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ex: 5000.00"
                    value={formAporte.valor}
                    onChange={(e) => setFormAporte({ ...formAporte, valor: e.target.value })}
                  />
                </div>
                <div className="form-grupo">
                  <label>Data do Aporte</label>
                  <input
                    type="date"
                    required
                    value={formAporte.data}
                    onChange={(e) => setFormAporte({ ...formAporte, data: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Finalidade do Aporte *</label>
                  <select
                    value={formAporte.finalidade}
                    onChange={(e) => setFormAporte({ ...formAporte, finalidade: e.target.value })}
                  >
                    <option value="Compra de mercadoria">Compra de mercadoria</option>
                    <option value="Capital de giro">Capital de giro</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Frete">Frete</option>
                    <option value="Estrutura">Estrutura</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Forma de Pagamento</label>
                  <select
                    value={formAporte.forma_pagamento}
                    onChange={(e) => setFormAporte({ ...formAporte, forma_pagamento: e.target.value })}
                  >
                    <option value="Pix">Pix</option>
                    <option value="Transferência">Transferência Bancária</option>
                    <option value="Depósito">Depósito</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              <div className="form-grupo">
                <label>Descrição / Observação (Ex: Compra Farm lote 1)</label>
                <input
                  type="text"
                  placeholder="Ex: Compra Farm lote 1, Reposição de estoque agosto..."
                  value={formAporte.observacao}
                  onChange={(e) => setFormAporte({ ...formAporte, observacao: e.target.value })}
                />
              </div>

              <div className="modal-fin-footer">
                <button type="button" className="btn-cancelar" onClick={() => setModalAporteAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-salvar" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Confirmar Aporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: NOVA RETIRADA
      =================================================== */}
      {modalRetiradaAberto && (
        <div className="modal-financeiro-overlay">
          <div className="modal-financeiro-card">
            <div className="modal-fin-header">
              <h3>Registrar Retirada / Distribuição de Sócio</h3>
              <button type="button" className="btn-fechar-modal" onClick={() => setModalRetiradaAberto(false)}>✕</button>
            </div>

            <form onSubmit={handleSalvarRetirada} className="modal-fin-form">
              <div className="form-grupo">
                <label>Sócio Beneficiário *</label>
                <select
                  required
                  value={formRetirada.socio_id || socioSelecionadoRetirada}
                  onChange={(e) => setFormRetirada({ ...formRetirada, socio_id: e.target.value })}
                >
                  <option value="">Selecione o sócio...</option>
                  {socios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Valor da Retirada (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ex: 2000.00"
                    value={formRetirada.valor}
                    onChange={(e) => setFormRetirada({ ...formRetirada, valor: e.target.value })}
                  />
                </div>
                <div className="form-grupo">
                  <label>Data</label>
                  <input
                    type="date"
                    required
                    value={formRetirada.data}
                    onChange={(e) => setFormRetirada({ ...formRetirada, data: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Tipo de Retirada</label>
                  <select
                    value={formRetirada.tipo}
                    onChange={(e) => setFormRetirada({ ...formRetirada, tipo: e.target.value })}
                  >
                    <option value="Distribuição de lucro">Distribuição de Lucro</option>
                    <option value="Retirada">Retirada de Capital</option>
                    <option value="Pró-labore">Pró-labore</option>
                    <option value="Reembolso">Reembolso</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Forma de Pagamento</label>
                  <select
                    value={formRetirada.forma_pagamento}
                    onChange={(e) => setFormRetirada({ ...formRetirada, forma_pagamento: e.target.value })}
                  >
                    <option value="Pix">Pix</option>
                    <option value="Transferência">Transferência Bancária</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div className="form-grupo">
                <label>Observação</label>
                <textarea
                  rows={2}
                  placeholder="Detalhes ou justificativa..."
                  value={formRetirada.observacao}
                  onChange={(e) => setFormRetirada({ ...formRetirada, observacao: e.target.value })}
                />
              </div>

              <div className="modal-fin-footer">
                <button type="button" className="btn-cancelar" onClick={() => setModalRetiradaAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-salvar" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Confirmar Retirada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: NOVA / EDITAR DESPESA
      =================================================== */}
      {modalDespesaAberto && (
        <div className="modal-financeiro-overlay">
          <div className="modal-financeiro-card">
            <div className="modal-fin-header">
              <h3>{despesaEmEdicao ? 'Editar Despesa' : 'Lançar Nova Despesa'}</h3>
              <button type="button" className="btn-fechar-modal" onClick={() => setModalDespesaAberto(false)}>✕</button>
            </div>

            <form onSubmit={handleSalvarDespesa} className="modal-fin-form">
              <div className="form-grupo">
                <label>Descrição da Despesa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Embalagens para envio, Conta de energia, etc."
                  value={formDespesa.descricao}
                  onChange={(e) => setFormDespesa({ ...formDespesa, descricao: e.target.value })}
                />
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Categoria *</label>
                  <select
                    value={formDespesa.categoria}
                    onChange={(e) => setFormDespesa({ ...formDespesa, categoria: e.target.value })}
                  >
                    {categoriasDespesa.map((cat) => (
                      <option key={cat.id} value={cat.nome}>
                        {cat.nome}
                      </option>
                    ))}
                    {categoriasDespesa.length === 0 && <option value="Outros">Outros</option>}
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ex: 150.00"
                    value={formDespesa.valor}
                    onChange={(e) => setFormDespesa({ ...formDespesa, valor: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-duplo">
                <div className="form-grupo">
                  <label>Data</label>
                  <input
                    type="date"
                    required
                    value={formDespesa.data}
                    onChange={(e) => setFormDespesa({ ...formDespesa, data: e.target.value })}
                  />
                </div>
                <div className="form-grupo">
                  <label>Forma de Pagamento</label>
                  <select
                    value={formDespesa.forma_pagamento}
                    onChange={(e) => setFormDespesa({ ...formDespesa, forma_pagamento: e.target.value })}
                  >
                    <option value="Pix">Pix</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div className="form-grupo">
                <label>Observação (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Número de nota fiscal, fornecedor, etc."
                  value={formDespesa.observacao}
                  onChange={(e) => setFormDespesa({ ...formDespesa, observacao: e.target.value })}
                />
              </div>

              <div className="modal-fin-footer">
                <button type="button" className="btn-cancelar" onClick={() => setModalDespesaAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-salvar" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar Despesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: DETALHES DO SÓCIO COM HISTÓRICO COMPLETO
      =================================================== */}
      {modalDetalheSocio && (
        <div className="modal-financeiro-overlay">
          <div className="modal-financeiro-card modal-largo">
            <div className="modal-fin-header">
              <div>
                <h3>{modalDetalheSocio.nome}</h3>
                <span className="modal-sub-socio">
                  Participação: {formatarPorcentagem(modalDetalheSocio.participacao_percentual)} · Desde {modalDetalheSocio.data_entrada ? new Date(modalDetalheSocio.data_entrada).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
              <button type="button" className="btn-fechar-modal" onClick={() => setModalDetalheSocio(null)}>✕</button>
            </div>

            <div className="detalhe-socio-resumo-grid">
              <div className="detalhe-card">
                <span>TOTAL APORTADO</span>
                <strong>{formatarMoeda(modalDetalheSocio.totalAportado)}</strong>
              </div>
              <div className="detalhe-card">
                <span>TOTAL RETIRADO</span>
                <strong>{formatarMoeda(modalDetalheSocio.totalRetirado)}</strong>
              </div>
              <div className="detalhe-card destaque">
                <span>SALDO HISTÓRICO</span>
                <strong>{formatarMoeda(modalDetalheSocio.saldoHistorico)}</strong>
              </div>
            </div>

            <div className="detalhe-socio-historico-secao">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b' }}>
                  HISTÓRICO DE APORTES ({modalDetalheSocio.aportes?.length || 0})
                </h4>
                <strong className="text-aportado" style={{ fontSize: '1.05rem' }}>
                  Total: {formatarMoeda(modalDetalheSocio.totalAportado)}
                </strong>
              </div>

              {modalDetalheSocio.aportes && modalDetalheSocio.aportes.length > 0 ? (
                <div className="financeiro-tabela-wrapper" style={{ marginBottom: '22px' }}>
                  <table className="financeiro-tabela">
                    <thead>
                      <tr>
                        <th>Rodada</th>
                        <th>Data</th>
                        <th>Valor</th>
                        <th>Finalidade</th>
                        <th>Descrição / Observação</th>
                        <th>Forma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalDetalheSocio.aportes.map((ap) => (
                        <tr key={ap.id}>
                          <td><strong>{ap.tituloAporte || `Aporte ${ap.numeroAporte || 1}`}</strong></td>
                          <td>{ap.data ? new Date(ap.data).toLocaleDateString('pt-BR') : '—'}</td>
                          <td><strong className="text-aportado">{formatarMoeda(ap.valor)}</strong></td>
                          <td><span className="categoria-tag">{ap.finalidade || 'Compra de mercadoria'}</span></td>
                          <td>{ap.observacao || '—'}</td>
                          <td><small>{ap.forma_pagamento || 'Pix'}</small></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: '800' }}>
                        <td colSpan={2}>TOTAL ACUMULADO</td>
                        <td className="text-aportado">{formatarMoeda(modalDetalheSocio.totalAportado)}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-muted">Nenhum aporte registrado para este sócio.</p>
              )}

              <h4 style={{ marginTop: '20px' }}>Histórico de Retiradas</h4>
              {modalDetalheSocio.retiradas && modalDetalheSocio.retiradas.length > 0 ? (
                <ul className="lista-historico-socio">
                  {modalDetalheSocio.retiradas.map((ret) => (
                    <li key={ret.id}>
                      <div>
                        <strong className="text-saida">{formatarMoeda(ret.valor)}</strong>
                        <small>{ret.data ? new Date(ret.data).toLocaleDateString('pt-BR') : '—'} · {ret.tipo || 'Distribuição'}</small>
                      </div>
                      <span>{ret.observacao || 'Retirada'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">Nenhuma retirada registrada para este sócio.</p>
              )}
            </div>

            <div className="modal-fin-footer">
              <button
                type="button"
                className="btn-fin-secundario"
                onClick={() => {
                  const sId = modalDetalheSocio.id
                  setModalDetalheSocio(null)
                  abrirModalNovoAporte(sId)
                }}
              >
                + Novo Aporte
              </button>
              <button
                type="button"
                className="btn-fin-secundario"
                onClick={() => {
                  const sId = modalDetalheSocio.id
                  setModalDetalheSocio(null)
                  abrirModalNovaRetirada(sId)
                }}
              >
                + Nova Retirada
              </button>
              <button type="button" className="btn-cancelar" onClick={() => setModalDetalheSocio(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Financeiro

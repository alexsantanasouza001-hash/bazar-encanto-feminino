import { useEffect, useMemo, useState } from 'react'
import { obterDataLocalHoje } from '../lib/dataLocal.js'
import {
  carregarAcertosRevendas,
  carregarPagamentosRevendas,
  carregarProdutos,
  carregarRemessas,
  carregarRevendedoras,
  carregarVendasRevendas,
  criarRemessaConsignacao,
  editarRemessaConsignacao,
  excluirRemessaConsignacao,
  registrarDevolucaoConsignada,
  registrarPagamentoRevenda,
  registrarVendasConsignadasLote,
  salvarRevendedora,
  carregarVendasAguardandoConferencia,
  confirmarVendaRevendedoraAdmin,
  recusarVendaRevendedoraAdmin,
  carregarPagamentosAguardandoConfirmacao,
  confirmarPagamentoRevendedoraAdmin,
  recusarPagamentoRevendedoraAdmin,
  consultarAcessoRevendedora,
  criarAcessoRevendedora,
  redefinirSenhaRevendedora,
  alterarStatusAcessoRevendedora
} from '../storage'
import {
  calcularPainelFinanceiroAdmin,
  calcularRateioFrete,
  calcularSaldoConsignadoItem,
  calcularTotaisLinhasVenda,
  consolidarResumoRevendedora,
  filtrarProdutosBusca,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  obterCoresProduto,
  obterTamanhosDisponiveis,
  obterTotalValorVendidoItem,
  validarEdicaoRemessa,
  validarLinhasVenda,
  validarPercentualDesconto,
  validarGradeTamanhosRemessa,
  agruparItensRemessaPorProdutoVariacao
} from './revendasHelpers.js'
import './Revendas.css'

// =====================================================
// COMPONENTE: SELETOR DE PRODUTO PARA REMESSAS COM GRADE DE TAMANHOS
// =====================================================
function SeletorItemRemessa({
  produtos = [],
  comissaoPadrao = 20,
  onAdicionarItens,
  labelBotao = '+ Adicionar Grade à Remessa'
}) {
  const [buscaProduto, setBuscaProduto] = useState('')
  const [produtoSelecionado, setProdutoSelecionado] = useState(null)
  const [variacaoSelecionada, setVariacaoSelecionada] = useState(null)
  const [gradeQuantidades, setGradeQuantidades] = useState({})
  const [precoRepasse, setPrecoRepasse] = useState(0)
  const [comissaoPercentual, setComissaoPercentual] = useState(comissaoPadrao)

  useEffect(() => {
    if (!produtoSelecionado) {
      setComissaoPercentual(comissaoPadrao ?? 20)
    }
  }, [comissaoPadrao, produtoSelecionado])

  const produtosFiltrados = useMemo(() => {
    if (produtoSelecionado) return []
    return filtrarProdutosBusca(produtos, buscaProduto)
  }, [produtos, buscaProduto, produtoSelecionado])

  const handleSelecionarProduto = (prod) => {
    setProdutoSelecionado(prod)
    setBuscaProduto(`${prod.nome} ${prod.sku ? `(SKU: ${prod.sku})` : ''}`)
    setPrecoRepasse(Number(prod.venda || 0))
    setComissaoPercentual(Number(comissaoPadrao ?? 20))

    let v0 = null
    let tams = []
    if (Array.isArray(prod.variacoes) && prod.variacoes.length > 0) {
      v0 = prod.variacoes[0]
      setVariacaoSelecionada(v0)
      tams = v0.tamanhos || []
    } else {
      setVariacaoSelecionada(null)
      tams = prod.tamanhos || []
    }

    const inicial = {}
    for (const t of tams) {
      inicial[t.tamanho || 'Único'] = 0
    }
    setGradeQuantidades(inicial)
  }

  const coresDisponiveis = useMemo(() => {
    return obterCoresProduto(produtoSelecionado)
  }, [produtoSelecionado])

  const tamanhosDisponiveis = useMemo(() => {
    return obterTamanhosDisponiveis(produtoSelecionado, variacaoSelecionada)
  }, [produtoSelecionado, variacaoSelecionada])

  const totalPecasGrade = useMemo(() => {
    return Object.values(gradeQuantidades).reduce((acc, q) => acc + Number(q || 0), 0)
  }, [gradeQuantidades])

  const handleMudarQuantidadeTamanho = (tamanhoNome, val) => {
    setGradeQuantidades((prev) => ({
      ...prev,
      [tamanhoNome]: Math.max(0, parseInt(val) || 0)
    }))
  }

  const handleAdicionar = (e) => {
    if (e && e.preventDefault) e.preventDefault()

    const validacao = validarGradeTamanhosRemessa({
      produto: produtoSelecionado,
      variacao: variacaoSelecionada,
      tamanhosDisponiveis,
      gradeQuantidades,
      precoRepasse,
      comissaoPercentual
    })

    if (!validacao.valido) {
      alert(validacao.erro)
      return
    }

    if (onAdicionarItens) {
      onAdicionarItens(validacao.itensMontados)
    }

    // Limpar formulário de busca
    setProdutoSelecionado(null)
    setVariacaoSelecionada(null)
    setGradeQuantidades({})
    setBuscaProduto('')
    setPrecoRepasse(0)
    setComissaoPercentual(Number(comissaoPadrao ?? 20))
  }

  return (
    <div className="remessa-seletor-produto-bloco">
      {/* CAMPO DE BUSCA */}
      <div className="form-campo-busca-prod">
        <label>Pesquisar Modelo para Adicionar (Nome ou SKU) *</label>
        <div className="input-busca-wrap">
          <input
            type="text"
            value={buscaProduto}
            onChange={(e) => {
              setBuscaProduto(e.target.value)
              if (!e.target.value) setProdutoSelecionado(null)
            }}
            placeholder="Digite o nome ou SKU do produto..."
            autoComplete="off"
          />
          {produtoSelecionado && (
            <button
              type="button"
              className="btn-limpar-selecao-prod"
              onClick={() => {
                setProdutoSelecionado(null)
                setBuscaProduto('')
                setGradeQuantidades({})
              }}
              title="Limpar seleção"
            >
              ✕
            </button>
          )}
        </div>

        {/* AUTOCOMPLETE LIST */}
        {!produtoSelecionado && produtosFiltrados.length > 0 && (
          <div className="autocomplete-produtos-lista">
            {produtosFiltrados.map((p) => (
              <button
                type="button"
                key={p.id}
                className="autocomplete-item"
                onClick={() => handleSelecionarProduto(p)}
              >
                <div className="auto-foto">
                  {p.foto ? <img src={p.foto} alt={p.nome} /> : '👗'}
                </div>
                <div className="auto-info">
                  <strong>{p.nome}</strong>
                  <span>
                    {p.sku ? `SKU: ${p.sku} • ` : ''}
                    Estoque Loja: {p.quantidade} un. • {formatarMoeda(p.venda)}
                  </span>
                </div>
                <span className="auto-btn-add">Selecionar</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DETALHES DO PRODUTO SELECIONADO COM GRADE DE TAMANHOS */}
      {produtoSelecionado && (
        <div className="area-detalhes-produto-selecionado remessa-detalhes-box">
          {coresDisponiveis.length > 1 && (
            <div className="form-grupo" style={{ marginBottom: '14px' }}>
              <label>Cor / Variação *</label>
              <select
                value={variacaoSelecionada?.id || ''}
                onChange={(e) => {
                  const vId = e.target.value
                  const vEnc = produtoSelecionado.variacoes?.find((v) => String(v.id) === String(vId))
                  setVariacaoSelecionada(vEnc || null)
                  const tams = vEnc?.tamanhos || []
                  const novaGrade = {}
                  for (const t of tams) {
                    novaGrade[t.tamanho || 'Único'] = 0
                  }
                  setGradeQuantidades(novaGrade)
                }}
              >
                {coresDisponiveis.map((c) => (
                  <option key={c.id || 'unica'} value={c.id || ''}>
                    {c.cor}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* GRADE DE TAMANHOS E QUANTIDADES */}
          <div className="grade-remessa-seletor-bloco">
            <div className="grade-remessa-topo">
              <strong>Grade de Tamanhos & Quantidades para Envio:</strong>
              <small>Informe as quantidades desejadas para cada tamanho da loja.</small>
            </div>

            <div className="grade-remessa-tamanhos-grid">
              {tamanhosDisponiveis.map((tam) => {
                const tamKey = tam.tamanho || 'Único'
                const disp = Number(tam.quantidade || 0)
                const qtdAtual = gradeQuantidades[tamKey] || 0

                return (
                  <div key={tam.id || tamKey} className={`card-tamanho-grade ${disp > 0 ? 'ativo' : 'sem-estoque'}`}>
                    <div className="card-tam-topo">
                      <span className="tam-letra">{tamKey}</span>
                      <span className="tam-estoque-loja" style={{ color: disp > 0 ? '#166534' : '#991b1b' }}>
                        {disp > 0 ? `${disp} em loja` : 'Sem estoque'}
                      </span>
                    </div>
                    <div className="card-tam-input-wrap">
                      <input
                        type="number"
                        min="0"
                        max={disp}
                        disabled={disp <= 0}
                        value={qtdAtual === 0 ? '' : qtdAtual}
                        onChange={(e) => handleMudarQuantidadeTamanho(tamKey, e.target.value)}
                        placeholder="0"
                        className="input-tam-qtd"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid-produto-negociacao" style={{ marginTop: '14px' }}>
            {/* VALOR DE REPASSE (R$) */}
            <div className="form-grupo">
              <label>Valor de Repasse Base por Peça (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precoRepasse}
                onChange={(e) => setPrecoRepasse(Number(e.target.value))}
              />
            </div>

            {/* COMISSÃO (%) */}
            <div className="form-grupo">
              <label>Comissão da Revendedora (%) *</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={comissaoPercentual}
                onChange={(e) => setComissaoPercentual(Number(e.target.value))}
              />
            </div>
          </div>

          {/* RESUMO E BOTÕES */}
          <div className="resumo-calculo-item-box">
            <div className="resumo-calc-valores">
              <span>Modelo: <strong>{produtoSelecionado.nome}</strong></span>
              <span>Cor: <strong>{variacaoSelecionada?.cor_nome || variacaoSelecionada?.cor || produtoSelecionado.cor || 'Única'}</strong></span>
              <span>Total a Enviar: <strong style={{ color: totalPecasGrade > 0 ? 'var(--primary)' : '#6b7280', fontSize: '15px' }}>{totalPecasGrade} {totalPecasGrade === 1 ? 'peça' : 'peças'}</strong></span>
              <span>Repasse Unitário: <strong>{formatarMoeda(precoRepasse)}</strong></span>
              <span>Total Previsto: <strong className="texto-destaque">{formatarMoeda(Number(precoRepasse || 0) * totalPecasGrade)}</strong></span>
            </div>

            <div className="botoes-acao-item">
              <button
                type="button"
                className="btn-cancelar-edicao-item"
                onClick={() => {
                  setProdutoSelecionado(null)
                  setGradeQuantidades({})
                  setBuscaProduto('')
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-adicionar-item-venda"
                onClick={handleAdicionar}
                disabled={totalPecasGrade <= 0}
              >
                {labelBotao} ({totalPecasGrade} un.)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Revendas() {
  const [abaAtiva, setAbaAtiva] = useState('revendedoras')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [mensagemSucesso, setMensagemSucesso] = useState(null)

  // Dados principais
  const [revendedoras, setRevendedoras] = useState([])
  const [remessas, setRemessas] = useState([])
  const [vendas, setVendas] = useState([])
  const [acertos, setAcertos] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [produtosLoja, setProdutosLoja] = useState([])

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroStatusRev, setFiltroStatusRev] = useState('todos')

  // Modais
  const [modalRevendedoraAberta, setModalRevendedoraAberta] = useState(false)
  const [revendedoraEmEdicao, setRevendedoraEmEdicao] = useState(null)
  const [modalRemessaAberta, setModalRemessaAberta] = useState(false)
  const [modalEditarRemessaAberta, setModalEditarRemessaAberta] = useState(false)
  const [_remessaEmEdicao, setRemessaEmEdicao] = useState(null)
  const [modalExcluirRemessaAberta, setModalExcluirRemessaAberta] = useState(false)
  const [remessaParaExcluir, setRemessaParaExcluir] = useState(null)
  const [excluindoRemessa, setExcluindoRemessa] = useState(false)
  const [erroExclusaoRemessa, setErroExclusaoRemessa] = useState(null)
  const [formEditarRemessa, setFormEditarRemessa] = useState({
    id: null,
    numero: '',
    revendedoraId: '',
    revendedoraNome: '',
    observacao: '',
    responsavel: '',
    itens: []
  })
  const [erroEdicaoRemessa, setErroEdicaoRemessa] = useState(null)
  const [modalVendaAberta, setModalVendaAberta] = useState(false)
  const [itemParaVenda, setItemParaVenda] = useState(null)
  const [modalDevolucaoAberta, setModalDevolucaoAberta] = useState(false)
  const [itemParaDevolucao, setItemParaDevolucao] = useState(null)
  const [modalPagamentoAberta, setModalPagamentoAberta] = useState(false)
  const [modalDetalhesRevAberta, setModalDetalhesRevAberta] = useState(false)
  const [revendedoraDetalhes, setRevendedoraDetalhes] = useState(null)

  // Vendas Aguardando Conferência & Portal
  const [_vendasAguardando, setVendasAguardando] = useState([])
  const [modalConferenciaAberta, setModalConferenciaAberta] = useState(false)
  const [vendaEmConferencia, setVendaEmConferencia] = useState(null)
  const [formConferencia, setFormConferencia] = useState({
    quantidade: 1,
    precoUnitario: 0,
    dataVenda: '',
    formaPagamento: 'Pix',
    observacao: '',
    percentualDesconto: 0
  })
  const [processandoConferencia, setProcessandoConferencia] = useState(false)
  const [modalRecusaAberta, setModalRecusaAberta] = useState(false)
  const [vendaParaRecusa, setVendaParaRecusa] = useState(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')

  // Pagamentos a Confirmar
  const [pagamentosAguardando, setPagamentosAguardando] = useState([])
  const [modalConfirmarPagamentoAberto, setModalConfirmarPagamentoAberto] = useState(false)
  const [pagamentoEmConfirmacao, setPagamentoEmConfirmacao] = useState(null)
  const [formConfirmarPag, setFormConfirmarPag] = useState({ valorConfirmado: '', observacao: '' })
  const [modalRecusarPagamentoAberto, setModalRecusarPagamentoAberto] = useState(false)
  const [pagamentoEmRecusa, setPagamentoEmRecusa] = useState(null)
  const [motivoRecusaPagamento, setMotivoRecusaPagamento] = useState('')
  const [processandoPagamento, setProcessandoPagamento] = useState(false)

  // Filtros da Aba Acertos & Financeiro
  const [filtroAcertoRevendedoraId, setFiltroAcertoRevendedoraId] = useState('todas')
  const [filtroAcertoRemessaId, setFiltroAcertoRemessaId] = useState('todas')
  const [filtroAcertoPeriodo, setFiltroAcertoPeriodo] = useState('todos')
  const [filtroAcertoDataInicio, setFiltroAcertoDataInicio] = useState('')
  const [filtroAcertoDataFim, setFiltroAcertoDataFim] = useState('')

  const [acessoPortalInfo, setAcessoPortalInfo] = useState(null)
  const [carregandoAcesso, setCarregandoAcesso] = useState(false)
  const [formNovoAcesso, setFormNovoAcesso] = useState({ email: '', senha: '' })
  const [salvandoAcesso, setSalvandoAcesso] = useState(false)

  // Formulário Revendedora
  const [formRev, setFormRev] = useState({
    nome: '',
    telefone: '',
    whatsapp: '',
    email: '',
    cpf_cnpj: '',
    cidade: '',
    estado: '',
    endereco: '',
    comissao_padrao: 20,
    periodicidade_acerto_dias: 15,
    data_inicio: obterDataLocalHoje(),
    observacoes: '',
    status: 'Ativa'
  })

  // Formulário Nova Remessa
  const [formRemessa, setFormRemessa] = useState({
    revendedoraId: '',
    observacao: '',
    responsavel: '',
    itens: []
  })

  // Formulário Venda com suporte a Múltiplos Preços (Linhas Dinâmicas) e Desconto (%)
  const [linhasVenda, setLinhasVenda] = useState([
    { quantidade: 1, precoUnitario: 0 }
  ])
  const [percentualDesconto, setPercentualDesconto] = useState(0)
  const [formVenda, setFormVenda] = useState({
    dataVenda: obterDataLocalHoje(),
    observacao: ''
  })
  const [erroValidacaoVenda, setErroValidacaoVenda] = useState(null)

  // Formulário Devolução
  const [formDevolucao, setFormDevolucao] = useState({
    quantidade: 1,
    motivo: ''
  })

  // Formulário Pagamento
  const [formPagamento, setFormPagamento] = useState({
    revendedoraId: '',
    acertoId: '',
    valor: '',
    formaPagamento: 'Pix',
    dataPagamento: obterDataLocalHoje(),
    observacao: ''
  })

  async function carregarTudo() {
    try {
      setCarregando(true)
      setErro(null)
      const [revs, rems, vends, acs, pags, prods, vendsAguardando, pagsAguardando] = await Promise.all([
        carregarRevendedoras(),
        carregarRemessas(),
        carregarVendasRevendas(),
        carregarAcertosRevendas(),
        carregarPagamentosRevendas(),
        carregarProdutos(true),
        carregarVendasAguardandoConferencia(),
        carregarPagamentosAguardandoConfirmacao()
      ])

      setRevendedoras(revs)
      setRemessas(rems)
      setVendas(vends)
      setAcertos(acs)
      setPagamentos(pags)
      setProdutosLoja(prods)
      setVendasAguardando(vendsAguardando || [])
      setPagamentosAguardando(pagsAguardando || [])
    } catch (err) {
      console.error('Erro ao carregar módulo revendas:', err)
      setErro('Não foi possível carregar os dados de revendas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarTudo()
  }, [])

  function exibirSucesso(msg) {
    setMensagemSucesso(msg)
    setTimeout(() => setMensagemSucesso(null), 4000)
  }

  // Resumo de cada revendedora
  const resumosRevendedoras = useMemo(() => {
    return revendedoras.map((rev) => {
      const consolidado = consolidarResumoRevendedora(rev, remessas, vendas, pagamentos)
      return { ...rev, ...consolidado }
    })
  }, [revendedoras, remessas, vendas, pagamentos])

  // KPIs Gerais de Revendas
  const kpisGerais = useMemo(() => {
    const ativas = revendedoras.filter((r) => r.status === 'Ativa').length
    const pecasConsignadas = resumosRevendedoras.reduce((acc, r) => acc + (r.pecasConsignadas || 0), 0)
    const valorConsignado = resumosRevendedoras.reduce((acc, r) => acc + (r.valorConsignado || 0), 0)
    const totalVendido = resumosRevendedoras.reduce((acc, r) => acc + (r.totalVendidoBruto || 0), 0)
    const totalComissao = resumosRevendedoras.reduce((acc, r) => acc + (r.totalComissao || 0), 0)
    const totalLoja = resumosRevendedoras.reduce((acc, r) => acc + (r.totalDevidoLoja || 0), 0)
    const totalPago = resumosRevendedoras.reduce((acc, r) => acc + (r.totalPago || 0), 0)
    const saldoReceber = Math.max(0, totalLoja - totalPago)
    const acertosAtrasados = resumosRevendedoras.filter((r) => r.atrasado).length

    return {
      ativas,
      pecasConsignadas,
      valorConsignado,
      totalVendido,
      totalComissao,
      totalLoja,
      totalPago,
      saldoReceber,
      acertosAtrasados
    }
  }, [revendedoras, resumosRevendedoras])

  // Filtro de revendedoras
  const revendedorasFiltradas = useMemo(() => {
    return resumosRevendedoras.filter((rev) => {
      if (filtroStatusRev !== 'todos' && rev.status !== filtroStatusRev) return false
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const nomeMatch = (rev.nome || '').toLowerCase().includes(termo)
        const cidadeMatch = (rev.cidade || '').toLowerCase().includes(termo)
        const emailMatch = (rev.email || '').toLowerCase().includes(termo)
        const telMatch = (rev.telefone || '').toLowerCase().includes(termo)
        if (!nomeMatch && !cidadeMatch && !emailMatch && !telMatch) return false
      }
      return true
    })
  }, [resumosRevendedoras, filtroStatusRev, busca])

  // Handlers Revendedora
  function abrirModalNovaRevendedora() {
    setRevendedoraEmEdicao(null)
    setAcessoPortalInfo(null)
    setFormRev({
      nome: '',
      telefone: '',
      whatsapp: '',
      email: '',
      cpf_cnpj: '',
      cidade: '',
      estado: '',
      endereco: '',
      comissao_padrao: 20,
      periodicidade_acerto_dias: 15,
      data_inicio: obterDataLocalHoje(),
      observacoes: '',
      status: 'Ativa',
      usa_divisao_lucro: false,
      percentual_lucro_revendedora: ''
    })
    setModalRevendedoraAberta(true)
  }

  function abrirEditarRevendedora(rev) {
    setRevendedoraEmEdicao(rev)
    setAcessoPortalInfo(null)
    setFormNovoAcesso({ email: rev.email || '', senha: '' })
    setFormRev({
      id: rev.id,
      nome: rev.nome || '',
      telefone: rev.telefone || '',
      whatsapp: rev.whatsapp || '',
      email: rev.email || '',
      cpf_cnpj: rev.cpf_cnpj || '',
      cidade: rev.cidade || '',
      estado: rev.estado || '',
      endereco: rev.endereco || '',
      comissao_padrao: rev.comissao_padrao ?? 20,
      periodicidade_acerto_dias: rev.periodicidade_acerto_dias ?? 15,
      data_inicio: rev.data_inicio || obterDataLocalHoje(),
      observacoes: rev.observacoes || '',
      status: rev.status || 'Ativa',
      usa_divisao_lucro: Boolean(rev.usa_divisao_lucro),
      percentual_lucro_revendedora: rev.percentual_lucro_revendedora != null && rev.percentual_lucro_revendedora !== '' ? Number(rev.percentual_lucro_revendedora) : ''
    })
    setModalRevendedoraAberta(true)

    setCarregandoAcesso(true)
    consultarAcessoRevendedora(rev.id)
      .then((res) => {
        if (res?.sucesso) {
          setAcessoPortalInfo(res.acesso)
          setFormNovoAcesso({ email: res.acesso.email || rev.email || '', senha: '' })
        }
      })
      .finally(() => setCarregandoAcesso(false))
  }

  async function handleCriarAcessoPortal() {
    if (!formNovoAcesso.email || !formNovoAcesso.email.includes('@')) {
      alert('Informe um e-mail válido para criar o login da revendedora.')
      return
    }
    if (formNovoAcesso.senha && formNovoAcesso.senha.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    try {
      setSalvandoAcesso(true)
      const res = await criarAcessoRevendedora({
        revendedoraId: revendedoraEmEdicao.id,
        email: formNovoAcesso.email,
        senha: formNovoAcesso.senha || 'Bazar@123456'
      })
      if (res?.sucesso) {
        exibirSucesso(res.mensagem || 'Acesso criado com sucesso!')
        const info = await consultarAcessoRevendedora(revendedoraEmEdicao.id)
        if (info?.sucesso) setAcessoPortalInfo(info.acesso)
      } else {
        const msg = res?.erro && !res.erro.includes('Failed to send a request') && !res.erro.includes('non-2xx')
          ? res.erro
          : 'Não foi possível criar o acesso da revendedora. Tente novamente.'
        alert(msg)
      }
    } catch (e) {
      console.error('Erro ao criar acesso:', e)
      alert('Não foi possível criar o acesso da revendedora. Tente novamente.')
    } finally {
      setSalvandoAcesso(false)
    }
  }

  async function handleRedefinirSenhaPortal() {
    const nova = window.prompt('Digite a nova senha para a revendedora (mínimo 6 caracteres):')
    if (nova === null) return
    if (nova.trim().length < 6) {
      alert('A senha deve conter no mínimo 6 caracteres.')
      return
    }
    try {
      setSalvandoAcesso(true)
      const res = await redefinirSenhaRevendedora({
        revendedoraId: revendedoraEmEdicao.id,
        novaSenha: nova.trim()
      })
      if (res?.sucesso) {
        exibirSucesso('Senha redefinida com sucesso!')
      } else {
        alert(res?.erro || 'Erro ao redefinir senha.')
      }
    } catch (e) {
      console.error('Erro ao redefinir senha:', e)
      alert('Erro inesperado.')
    } finally {
      setSalvandoAcesso(false)
    }
  }

  async function handleAlterarStatusAcessoPortal(novoStatus) {
    const acaoNome = novoStatus === 'BLOQUEADO' ? 'bloquear' : 'desbloquear'
    if (!window.confirm(`Tem certeza que deseja ${acaoNome} o acesso desta revendedora ao Portal?`)) {
      return
    }
    try {
      setSalvandoAcesso(true)
      const res = await alterarStatusAcessoRevendedora({
        revendedoraId: revendedoraEmEdicao.id,
        statusAcesso: novoStatus
      })
      if (res?.sucesso) {
        exibirSucesso(res.mensagem || 'Status alterado com sucesso!')
        const info = await consultarAcessoRevendedora(revendedoraEmEdicao.id)
        if (info?.sucesso) setAcessoPortalInfo(info.acesso)
      } else {
        alert(res?.erro || 'Erro ao alterar status de acesso.')
      }
    } catch (e) {
      console.error('Erro ao alterar status:', e)
      alert('Erro inesperado.')
    } finally {
      setSalvandoAcesso(false)
    }
  }

  function _handleAbrirConferencia(venda) {
    setVendaEmConferencia(venda)
    setFormConferencia({
      quantidade: venda.quantidade || 1,
      precoUnitario: venda.preco_unitario_vendido || 0,
      dataVenda: venda.data_venda ? venda.data_venda.slice(0, 10) : obterDataLocalHoje(),
      formaPagamento: venda.forma_pagamento || 'Pix',
      observacao: venda.observacao || '',
      percentualDesconto: venda.percentual_desconto || 0
    })
    setModalConferenciaAberta(true)
  }

  async function _handleConfirmarDireto(vendaId) {
    if (!window.confirm('Deseja confirmar esta venda e efetivar a baixa definitiva no estoque e comissões?')) {
      return
    }
    try {
      setProcessandoConferencia(true)
      const res = await confirmarVendaRevendedoraAdmin({ vendaId })
      if (res?.sucesso) {
        exibirSucesso('Venda confirmada com sucesso!')
        carregarTudo()
      } else {
        alert(res?.mensagem || 'Erro ao confirmar venda.')
      }
    } catch (e) {
      console.error('Erro ao confirmar venda:', e)
      alert('Erro inesperado ao confirmar venda.')
    } finally {
      setProcessandoConferencia(false)
    }
  }

  async function _handleSalvarConfirmacaoComAjustes(e) {
    e.preventDefault()
    if (!vendaEmConferencia) return

    try {
      setProcessandoConferencia(true)
      const res = await confirmarVendaRevendedoraAdmin({
        vendaId: vendaEmConferencia.id,
        quantidade: Number(formConferencia.quantidade),
        precoUnitario: Number(formConferencia.precoUnitario),
        dataVenda: formConferencia.dataVenda,
        formaPagamento: formConferencia.formaPagamento,
        observacao: formConferencia.observacao,
        percentualDesconto: Number(formConferencia.percentualDesconto || 0)
      })

      if (res?.sucesso) {
        setModalConferenciaAberta(false)
        setVendaEmConferencia(null)
        exibirSucesso('Venda corrigida e confirmada com sucesso!')
        carregarTudo()
      } else {
        alert(res?.mensagem || 'Erro ao confirmar venda com ajustes.')
      }
    } catch (err) {
      console.error('Erro ao salvar conferência:', err)
      alert('Erro inesperado ao processar conferência.')
    } finally {
      setProcessandoConferencia(false)
    }
  }

  function _handleAbrirRecusa(venda) {
    setVendaParaRecusa(venda)
    setMotivoRecusa('')
    setModalRecusaAberta(true)
  }

  async function handleConfirmarRecusa(e) {
    e.preventDefault()
    if (!vendaParaRecusa) return

    try {
      setProcessandoConferencia(true)
      const res = await recusarVendaRevendedoraAdmin({
        vendaId: vendaParaRecusa.id,
        motivo: motivoRecusa.trim() || null
      })

      if (res?.sucesso) {
        setModalRecusaAberta(false)
        setVendaParaRecusa(null)
        setMotivoRecusa('')
        exibirSucesso(res.mensagem || 'Venda recusada e peças liberadas de volta para a revendedora.')
        carregarTudo()
      } else {
        alert(res?.mensagem || 'Erro ao recusar venda.')
      }
    } catch (err) {
      console.error('Erro ao recusar venda:', err)
      alert('Erro inesperado ao recusar venda.')
    } finally {
      setProcessandoConferencia(false)
    }
  }

  function handleAbrirConfirmarPagamento(pagamento) {
    setPagamentoEmConfirmacao(pagamento)
    setFormConfirmarPag({
      valorConfirmado: pagamento.valor_informado != null ? pagamento.valor_informado : pagamento.valor,
      observacao: pagamento.observacao || ''
    })
    setModalConfirmarPagamentoAberto(true)
  }

  async function handleSalvarConfirmacaoPagamento(e) {
    e.preventDefault()
    if (!pagamentoEmConfirmacao) return

    const val = parseFloat(formConfirmarPag.valorConfirmado)
    if (isNaN(val) || val <= 0) {
      alert('Por favor, informe um valor recebido válido.')
      return
    }

    try {
      setProcessandoPagamento(true)
      const res = await confirmarPagamentoRevendedoraAdmin({
        pagamentoId: pagamentoEmConfirmacao.id,
        valorConfirmado: val,
        observacao: formConfirmarPag.observacao
      })

      if (res?.sucesso) {
        const idConfirmado = pagamentoEmConfirmacao.id
        setModalConfirmarPagamentoAberto(false)
        setPagamentoEmConfirmacao(null)
        setPagamentosAguardando((prev) => prev.filter((p) => p.id !== idConfirmado))
        exibirSucesso('Pagamento confirmado com sucesso! O saldo da revendedora foi atualizado.')
        await carregarTudo()
      } else {
        alert(res?.mensagem || 'Falha ao confirmar pagamento.')
      }
    } catch (err) {
      console.error('Erro ao confirmar pagamento:', err)
      alert(err.message || 'Erro inesperado ao confirmar pagamento.')
    } finally {
      setProcessandoPagamento(false)
    }
  }

  function handleAbrirRecusarPagamento(pagamento) {
    setPagamentoEmRecusa(pagamento)
    setMotivoRecusaPagamento('')
    setModalRecusarPagamentoAberto(true)
  }

  async function handleSalvarRecusaPagamento(e) {
    e.preventDefault()
    if (!pagamentoEmRecusa) return

    if (!motivoRecusaPagamento.trim()) {
      alert('É obrigatório informar o motivo da recusa (ex: "PIX não localizado").')
      return
    }

    try {
      setProcessandoPagamento(true)
      const res = await recusarPagamentoRevendedoraAdmin({
        pagamentoId: pagamentoEmRecusa.id,
        motivoRecusa: motivoRecusaPagamento.trim()
      })

      if (res?.sucesso) {
        const idRecusado = pagamentoEmRecusa.id
        setModalRecusarPagamentoAberto(false)
        setPagamentoEmRecusa(null)
        setMotivoRecusaPagamento('')
        setPagamentosAguardando((prev) => prev.filter((p) => p.id !== idRecusado))
        exibirSucesso('Pagamento recusado.')
        await carregarTudo()
      } else {
        alert(res?.mensagem || 'Falha ao recusar pagamento.')
      }
    } catch (err) {
      console.error('Erro ao recusar pagamento:', err)
      alert(err.message || 'Erro inesperado ao recusar pagamento.')
    } finally {
      setProcessandoPagamento(false)
    }
  }

  async function handleSalvarRevendedora(e) {
    e.preventDefault()
    if (!formRev.nome.trim()) {
      alert('Informe o nome da revendedora.')
      return
    }
    const res = await salvarRevendedora(formRev)
    if (res.sucesso) {
      setModalRevendedoraAberta(false)
      exibirSucesso('Revendedora salva com sucesso!')
      carregarTudo()
    } else {
      alert(res.mensagem || 'Erro ao salvar revendedora.')
    }
  }

  // Handlers Nova Remessa
  function abrirModalNovaRemessa(revIdPadrao = '') {
    const revId = revIdPadrao || (revendedoras[0]?.id ? String(revendedoras[0].id) : '')

    setFormRemessa({
      revendedoraId: revId,
      observacao: '',
      responsavel: '',
      frete: '',
      itens: []
    })
    setModalRemessaAberta(true)
  }

  function atualizarQuantidadeGradeRemessa(chaveGrupo, tamanho, valor) {
    const novaQtd = Math.max(1, parseInt(valor) || 1)
    setFormRemessa((prev) => ({
      ...prev,
      itens: prev.itens.map((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        if (chave === chaveGrupo && item.tamanho === tamanho) {
          return { ...item, quantidade: novaQtd }
        }
        return item
      })
    }))
  }

  function removerTamanhoGradeRemessa(chaveGrupo, tamanho) {
    setFormRemessa((prev) => ({
      ...prev,
      itens: prev.itens.filter((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        return !(chave === chaveGrupo && item.tamanho === tamanho)
      })
    }))
  }

  function atualizarValoresGrupoRemessa(chaveGrupo, campo, valor) {
    const numVal = parseFloat(valor) || 0
    setFormRemessa((prev) => ({
      ...prev,
      itens: prev.itens.map((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        if (chave === chaveGrupo) {
          if (campo === 'valor_repasse_base') {
            return { ...item, valor_repasse_base: numVal, preco_venda_sugerido: numVal }
          }
          return { ...item, [campo]: numVal }
        }
        return item
      })
    }))
  }

  function removerGrupoRemessa(chaveGrupo) {
    setFormRemessa((prev) => ({
      ...prev,
      itens: prev.itens.filter((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        return chave !== chaveGrupo
      })
    }))
  }

  async function handleCriarRemessa(e) {
    e.preventDefault()
    if (!formRemessa.revendedoraId) {
      alert('Selecione a revendedora.')
      return
    }
    const itensValidos = formRemessa.itens.filter((i) => Number(i.quantidade) > 0)
    if (itensValidos.length === 0) {
      alert('Adicione ao menos um modelo com quantidade maior que zero à remessa.')
      return
    }

    // Validações
    for (const item of itensValidos) {
      if (!item.produto_id) {
        alert('Selecione o produto para todos os itens da remessa.')
        return
      }
      if (Number(item.quantidade) <= 0) {
        alert('A quantidade enviada deve ser maior que zero.')
        return
      }
    }

    const totalPecas = itensValidos.reduce((acc, i) => acc + Number(i.quantidade || 1), 0)
    const freteTotal = Number(formRemessa.frete || 0)
    const freteUnitario = calcularRateioFrete(freteTotal, totalPecas)

    const payloadItens = itensValidos.map((i) => {
      const repBase = Number(i.valor_repasse_base !== undefined && i.valor_repasse_base !== null ? i.valor_repasse_base : (i.preco_venda_sugerido || 0))
      const repEfetivo = Number((repBase + freteUnitario).toFixed(2))

      return {
        produto_id: Number(i.produto_id),
        produto_tamanho_id: i.produto_tamanho_id ? Number(i.produto_tamanho_id) : null,
        variacao_id: i.variacao_id ? Number(i.variacao_id) : null,
        tamanho: i.tamanho || null,
        cor: i.cor || null,
        cor_hex: i.cor_hex || null,
        quantidade: Number(i.quantidade),
        valor_repasse_base: repBase,
        frete_rateado_unitario: freteUnitario,
        preco_venda_sugerido: repEfetivo,
        comissao_percentual: Number(i.comissao_percentual)
      }
    })

    const res = await criarRemessaConsignacao({
      revendedoraId: formRemessa.revendedoraId,
      itens: payloadItens,
      observacao: formRemessa.observacao,
      responsavel: formRemessa.responsavel,
      frete: freteTotal
    })

    if (res.sucesso) {
      setModalRemessaAberta(false)
      exibirSucesso(`Remessa ${res.numero} criada com sucesso! Estoque da loja foi atualizado.`)
      carregarTudo()
    } else {
      alert(res.mensagem || 'Erro ao criar remessa.')
    }
  }

  // Handlers Editar Remessa
  function abrirModalEditarRemessa(rem) {
    setRemessaEmEdicao(rem)
    setErroEdicaoRemessa(null)
    setFormEditarRemessa({
      id: rem.id,
      numero: rem.numero,
      revendedoraId: rem.revendedora_id,
      revendedoraNome: rem.revendedora_nome || 'Revendedora',
      observacao: rem.observacao || '',
      responsavel: rem.responsavel || '',
      frete: Number(rem.frete || 0) > 0 ? Number(rem.frete) : '',
      itens: (rem.itens || []).map((i) => ({
        id: i.id,
        produto_id: String(i.produto_id),
        produto_nome: i.produto_nome,
        sku: i.sku || '',
        produto_tamanho_id: i.produto_tamanho_id ? String(i.produto_tamanho_id) : '',
        variacao_id: i.variacao_id ? String(i.variacao_id) : '',
        tamanho: i.tamanho || '',
        cor: i.cor || '',
        cor_hex: i.cor_hex || '',
        quantidade_enviada: Number(i.quantidade_enviada),
        quantidade_vendida: Number(i.quantidade_vendida || 0),
        quantidade_devolvida: Number(i.quantidade_devolvida || 0),
        min_quantidade: Number(i.quantidade_vendida || 0) + Number(i.quantidade_devolvida || 0),
        valor_repasse_base: Number(i.valor_repasse_base != null ? i.valor_repasse_base : (i.preco_venda_sugerido || 0)),
        frete_rateado_unitario: Number(i.frete_rateado_unitario || 0),
        preco_venda_sugerido: Number(i.preco_venda_sugerido || 0),
        comissao_percentual: Number(i.comissao_percentual ?? 20)
      }))
    })
    setModalEditarRemessaAberta(true)
  }

  function atualizarQuantidadeGradeEdicao(chaveGrupo, tamanho, valor) {
    const novaQtd = Math.max(0, parseInt(valor) || 0)
    setFormEditarRemessa((prev) => ({
      ...prev,
      itens: prev.itens.map((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        if (chave === chaveGrupo && item.tamanho === tamanho) {
          const min = item.min_quantidade || 0
          if (novaQtd < min) {
            alert(`A quantidade não pode ser menor que ${min} pois já houve vendas ou devoluções registradas.`)
            return item
          }
          return { ...item, quantidade_enviada: novaQtd }
        }
        return item
      })
    }))
  }

  function atualizarValoresGrupoEdicao(chaveGrupo, campo, valor) {
    const numVal = parseFloat(valor) || 0
    setFormEditarRemessa((prev) => ({
      ...prev,
      itens: prev.itens.map((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        if (chave === chaveGrupo) {
          if (campo === 'valor_repasse_base') {
            return { ...item, valor_repasse_base: numVal, preco_venda_sugerido: numVal }
          }
          return { ...item, [campo]: numVal }
        }
        return item
      })
    }))
  }

  function removerGrupoEdicao(chaveGrupo) {
    const itensGrupo = formEditarRemessa.itens.filter((item) => {
      const prodId = item.produto_id || item.produtoId
      const varId = item.variacao_id || item.variacaoId || 'sem_var'
      const chave = `${prodId}_${varId}`
      return chave === chaveGrupo
    })

    const temMovimentacao = itensGrupo.some((i) => (i.min_quantidade || 0) > 0)
    if (temMovimentacao) {
      alert('Não é possível remover este produto pois já possui peças vendidas ou devolvidas.')
      return
    }

    setFormEditarRemessa((prev) => ({
      ...prev,
      itens: prev.itens.filter((item) => {
        const prodId = item.produto_id || item.produtoId
        const varId = item.variacao_id || item.variacaoId || 'sem_var'
        const chave = `${prodId}_${varId}`
        return chave !== chaveGrupo
      })
    }))
  }

  async function handleSalvarEdicaoRemessa(e) {
    e.preventDefault()
    setErroEdicaoRemessa(null)

    const validacao = validarEdicaoRemessa(formEditarRemessa.itens)
    if (!validacao.valido) {
      setErroEdicaoRemessa(validacao.erro)
      return
    }

    const totalPecas = formEditarRemessa.itens.reduce((acc, i) => acc + Number(i.quantidade_enviada || 1), 0)
    const freteTotal = Number(formEditarRemessa.frete || 0)
    const freteUnitario = calcularRateioFrete(freteTotal, totalPecas)

    const payloadItens = formEditarRemessa.itens.map((i) => {
      const repBase = Number(i.valor_repasse_base !== undefined && i.valor_repasse_base !== null ? i.valor_repasse_base : (i.preco_venda_sugerido || 0))
      const repEfetivo = Number((repBase + freteUnitario).toFixed(2))

      return {
        id: i.id || null,
        produto_id: Number(i.produto_id),
        produto_tamanho_id: i.produto_tamanho_id ? Number(i.produto_tamanho_id) : null,
        variacao_id: i.variacao_id ? Number(i.variacao_id) : null,
        tamanho: i.tamanho || null,
        cor: i.cor || null,
        cor_hex: i.cor_hex || null,
        quantidade: Number(i.quantidade_enviada),
        valor_repasse_base: repBase,
        frete_rateado_unitario: freteUnitario,
        preco_venda_sugerido: repEfetivo,
        comissao_percentual: Number(i.comissao_percentual)
      }
    })

    const res = await editarRemessaConsignacao({
      remessaId: formEditarRemessa.id,
      observacao: formEditarRemessa.observacao,
      responsavel: formEditarRemessa.responsavel,
      itens: payloadItens,
      frete: freteTotal
    })

    if (res.sucesso) {
      setModalEditarRemessaAberta(false)
      exibirSucesso(`Remessa ${formEditarRemessa.numero} atualizada com sucesso! Estoque e saldos ajustados.`)
      carregarTudo()
    } else {
      setErroEdicaoRemessa(res.mensagem || 'Erro ao atualizar remessa.')
    }
  }

  // Handlers Excluir Remessa
  function abrirModalExcluirRemessa(rem) {
    setRemessaParaExcluir(rem)
    setErroExclusaoRemessa(null)
    setModalExcluirRemessaAberta(true)
  }

  async function handleConfirmarExclusaoRemessa() {
    if (!remessaParaExcluir) return
    setErroExclusaoRemessa(null)

    // 1. Validação A: Verificar se existem vendas vinculadas
    const temVendas = (Array.isArray(vendas) ? vendas : []).some((v) => Number(v.remessa_id) === Number(remessaParaExcluir.id))
    if (temVendas) {
      setErroExclusaoRemessa('Esta remessa possui vendas vinculadas e não pode ser excluída.')
      return
    }

    // 2. Validação B: Verificar se existem pagamentos vinculados
    const temPagamentos = (Array.isArray(pagamentos) ? pagamentos : []).some((p) => Number(p.remessa_id) === Number(remessaParaExcluir.id))
    if (temPagamentos) {
      setErroExclusaoRemessa('Esta remessa possui movimentações financeiras e não pode ser excluída.')
      return
    }

    try {
      setExcluindoRemessa(true)
      const res = await excluirRemessaConsignacao({ remessaId: remessaParaExcluir.id })
      if (res?.sucesso) {
        setModalExcluirRemessaAberta(false)
        setRemessaParaExcluir(null)
        exibirSucesso(`Remessa ${remessaParaExcluir.numero} excluída com sucesso! Os itens retornaram ao estoque da loja.`)
        await carregarTudo()
      } else {
        setErroExclusaoRemessa(res?.mensagem || 'Erro ao excluir remessa.')
      }
    } catch (err) {
      console.error('Erro ao excluir remessa:', err)
      setErroExclusaoRemessa(err.message || 'Erro inesperado ao excluir remessa.')
    } finally {
      setExcluindoRemessa(false)
    }
  }

  // Memos do Painel Financeiro e Acertos Administrativos
  const remessasDisponiveisFiltro = useMemo(() => {
    if (filtroAcertoRevendedoraId === 'todas' || !filtroAcertoRevendedoraId) {
      return remessas
    }
    return remessas.filter((r) => Number(r.revendedora_id) === Number(filtroAcertoRevendedoraId))
  }, [remessas, filtroAcertoRevendedoraId])

  const painelFinanceiro = useMemo(() => {
    return calcularPainelFinanceiroAdmin({
      vendas,
      revendedoras,
      remessas,
      pagamentos,
      produtos: produtosLoja,
      filtroRevendedoraId: filtroAcertoRevendedoraId,
      filtroRemessaId: filtroAcertoRemessaId,
      filtroPeriodo: filtroAcertoPeriodo,
      dataInicioCustom: filtroAcertoDataInicio,
      dataFimCustom: filtroAcertoDataFim
    })
  }, [vendas, revendedoras, remessas, pagamentos, produtosLoja, filtroAcertoRevendedoraId, filtroAcertoRemessaId, filtroAcertoPeriodo, filtroAcertoDataInicio, filtroAcertoDataFim])

  // Handlers Venda Consignada (Multi-Preço e Desconto %)
  function abrirModalVenda(item) {
    setItemParaVenda(item)
    const saldo = calcularSaldoConsignadoItem(item)
    setLinhasVenda([
      {
        quantidade: saldo > 0 ? (saldo === 1 ? 1 : Math.min(1, saldo)) : 1,
        precoUnitario: Number(item.preco_venda_sugerido || 0)
      }
    ])
    setPercentualDesconto(0)
    setFormVenda({
      dataVenda: obterDataLocalHoje(),
      observacao: ''
    })
    setErroValidacaoVenda(null)
    setModalVendaAberta(true)
  }

  function adicionarLinhaVenda() {
    setLinhasVenda((prev) => [
      ...prev,
      {
        quantidade: 1,
        precoUnitario: Number(itemParaVenda?.preco_venda_sugerido || 0)
      }
    ])
    setErroValidacaoVenda(null)
  }

  function removerLinhaVenda(index) {
    if (linhasVenda.length <= 1) return
    setLinhasVenda((prev) => prev.filter((_, idx) => idx !== index))
    setErroValidacaoVenda(null)
  }

  function atualizarLinhaVenda(index, campo, valor) {
    setLinhasVenda((prev) => {
      const novo = [...prev]
      novo[index] = {
        ...novo[index],
        [campo]: valor
      }
      return novo
    })
    setErroValidacaoVenda(null)
  }

  // Totais calculados em tempo real sobre as linhas de venda (respeitando repasse e desconto percentual)
  const totaisVenda = useMemo(() => {
    return calcularTotaisLinhasVenda(
      linhasVenda,
      itemParaVenda?.comissao_percentual || 0,
      itemParaVenda?.preco_venda_sugerido || 0,
      percentualDesconto
    )
  }, [linhasVenda, itemParaVenda, percentualDesconto])

  async function handleRegistrarVenda(e) {
    e.preventDefault()
    if (!itemParaVenda) return
    const saldo = calcularSaldoConsignadoItem(itemParaVenda)

    const validacao = validarLinhasVenda(linhasVenda, saldo)
    if (!validacao.valido) {
      setErroValidacaoVenda(validacao.erro)
      return
    }

    const validacaoDesc = validarPercentualDesconto(percentualDesconto)
    if (!validacaoDesc.valido) {
      setErroValidacaoVenda(validacaoDesc.erro)
      return
    }

    const res = await registrarVendasConsignadasLote({
      remessaItemId: itemParaVenda.id,
      vendas: linhasVenda,
      dataVenda: formVenda.dataVenda,
      observacao: formVenda.observacao,
      percentualDesconto: validacaoDesc.percentual
    })

    if (res.sucesso) {
      setModalVendaAberta(false)
      exibirSucesso('Vendas registradas com sucesso! Comissão e saldo da loja atualizados.')
      carregarTudo()
    } else {
      setErroValidacaoVenda(res.mensagem || 'Erro ao registrar vendas.')
    }
  }

  // Handlers Devolução Consignada
  function abrirModalDevolucao(item) {
    setItemParaDevolucao(item)
    const saldo = calcularSaldoConsignadoItem(item)
    setFormDevolucao({
      quantidade: Math.min(1, saldo),
      motivo: ''
    })
    setModalDevolucaoAberta(true)
  }

  async function handleRegistrarDevolucao(e) {
    e.preventDefault()
    if (!itemParaDevolucao) return
    const saldo = calcularSaldoConsignadoItem(itemParaDevolucao)
    if (Number(formDevolucao.quantidade) > saldo) {
      alert(`Quantidade devolvida não pode exceder o saldo em consignação (${saldo} peça(s)).`)
      return
    }

    const res = await registrarDevolucaoConsignada({
      remessaItemId: itemParaDevolucao.id,
      quantidade: formDevolucao.quantidade,
      motivo: formDevolucao.motivo
    })

    if (res.sucesso) {
      setModalDevolucaoAberta(false)
      exibirSucesso('Devolução registrada! As peças retornaram imediatamente ao estoque disponível da loja.')
      carregarTudo()
    } else {
      alert(res.mensagem || 'Erro ao registrar devolução.')
    }
  }

  // Handlers Pagamento / Acerto
  function abrirModalPagamento(revId = '', acertoId = '') {
    setFormPagamento({
      revendedoraId: revId || (revendedoras[0]?.id ? String(revendedoras[0].id) : ''),
      acertoId: acertoId ? String(acertoId) : '',
      valor: '',
      formaPagamento: 'Pix',
      dataPagamento: obterDataLocalHoje(),
      observacao: ''
    })
    setModalPagamentoAberta(true)
  }

  async function handleRegistrarPagamento(e) {
    e.preventDefault()
    if (!formPagamento.revendedoraId) {
      alert('Selecione a revendedora.')
      return
    }
    if (Number(formPagamento.valor) <= 0) {
      alert('Informe um valor de pagamento válido.')
      return
    }

    const res = await registrarPagamentoRevenda({
      revendedoraId: formPagamento.revendedoraId,
      acertoId: formPagamento.acertoId,
      valor: formPagamento.valor,
      formaPagamento: formPagamento.formaPagamento,
      dataPagamento: formPagamento.dataPagamento,
      observacao: formPagamento.observacao
    })

    if (res.sucesso) {
      setModalPagamentoAberta(false)
      exibirSucesso('Pagamento registrado com sucesso! Saldo atualizado.')
      carregarTudo()
    } else {
      alert(res.mensagem || 'Erro ao registrar pagamento.')
    }
  }

  function abrirDetalhesRevendedora(rev) {
    const consolidado = consolidarResumoRevendedora(rev, remessas, vendas, pagamentos)
    setRevendedoraDetalhes({ ...rev, ...consolidado })
    setModalDetalhesRevAberta(true)
  }

  const abrirWhatsApp = (rev) => {
    const tel = rev.whatsapp || rev.telefone
    if (!tel) return
    const digits = tel.replace(/\D/g, '')
    const numeroCompleto = digits.startsWith('55') ? digits : `55${digits}`
    const mensagem = `Olá, ${rev.nome}! Entramos em contato do Bazar Encanto Feminino sobre sua parceria de consignação.`
    window.open(`https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`, '_blank')
  }

  return (
    <div className="revendas-page">
      {/* ===================================================
          CABEÇALHO
      =================================================== */}
      <header className="revendas-header">
        <div>
          <span className="revendas-eyebrow">BAZAR ENCANTO FEMININO</span>
          <h1>Revendas & Consignação</h1>
          <p>Controle mercadorias consignadas, vendas realizadas, comissões configuráveis e acertos quinzenais.</p>
        </div>

        <div className="revendas-header-acoes">
          <button type="button" className="btn-acao-header secundario" onClick={abrirModalNovaRevendedora}>
            <span>+</span> Nova Revendedora
          </button>
          <button type="button" className="btn-acao-header primario" onClick={() => abrirModalNovaRemessa()}>
            <span>+</span> Nova Remessa
          </button>
        </div>
      </header>

      {mensagemSucesso && (
        <div className="revendas-alerta-sucesso">
          <span>✓</span> {mensagemSucesso}
        </div>
      )}

      {/* ===================================================
          CARDS PRINCIPAIS (KPIS)
      =================================================== */}
      <section className="revendas-kpis-grid">
        <div className="rev-kpi-card">
          <span className="kpi-tag">PARCEIRAS</span>
          <strong>{kpisGerais.ativas}</strong>
          <small>Revendedoras ativas</small>
        </div>

        <div className="rev-kpi-card destaque">
          <span className="kpi-tag">CONSIGNADO</span>
          <strong>{kpisGerais.pecasConsignadas} un.</strong>
          <small>{formatarMoeda(kpisGerais.valorConsignado)} em mercadoria</small>
        </div>

        <div className="rev-kpi-card">
          <span className="kpi-tag">VENDAS REVENDA</span>
          <strong>{formatarMoeda(kpisGerais.totalVendido)}</strong>
          <small>Comissão revendedoras: {formatarMoeda(kpisGerais.totalComissao)}</small>
        </div>

        <div className="rev-kpi-card">
          <span className="kpi-tag">RECEITA LOJA</span>
          <strong>{formatarMoeda(kpisGerais.totalLoja)}</strong>
          <small>Valor líquido devido à loja</small>
        </div>

        <div className="rev-kpi-card alerta">
          <span className="kpi-tag">A RECEBER</span>
          <strong className="text-destaque-saldo">{formatarMoeda(kpisGerais.saldoReceber)}</strong>
          <small>
            {kpisGerais.acertosAtrasados > 0
              ? `⚠ ${kpisGerais.acertosAtrasados} acerto(s) atrasado(s)`
              : 'Acertos em dia'}
          </small>
        </div>
      </section>

      {/* ===================================================
          NAVEGAÇÃO POR ABAS
      =================================================== */}
      <div className="revendas-abas-nav">
        <button
          type="button"
          className={`aba-btn ${abaAtiva === 'revendedoras' ? 'active' : ''}`}
          onClick={() => setAbaAtiva('revendedoras')}
        >
          Revendedoras ({revendedoras.length})
        </button>
        <button
          type="button"
          className={`aba-btn ${abaAtiva === 'remessas' ? 'active' : ''}`}
          onClick={() => setAbaAtiva('remessas')}
        >
          Remessas Consignadas ({remessas.length})
        </button>
        <button
          type="button"
          className={`aba-btn ${abaAtiva === 'acertos' ? 'active' : ''}`}
          onClick={() => setAbaAtiva('acertos')}
        >
          Acertos & Financeiro ({acertos.length + pagamentos.length})
        </button>
        <button
          type="button"
          className={`aba-btn ${abaAtiva === 'conferencia' ? 'active' : ''}`}
          onClick={() => setAbaAtiva('conferencia')}
          style={{ position: 'relative' }}
        >
          Pagamentos a Confirmar
          {pagamentosAguardando.length > 0 && (
            <span style={{
              marginLeft: '8px',
              background: 'var(--warning, #B8893F)',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px'
            }}>
              ● {pagamentosAguardando.length}
            </span>
          )}
        </button>
      </div>

      {carregando && (
        <div className="revendas-feedback-state">
          <span>✿</span>
          <strong>Carregando dados de revendas...</strong>
        </div>
      )}

      {erro && !carregando && (
        <div className="revendas-feedback-state error">
          <p>{erro}</p>
          <button type="button" className="btn-tentar-novamente" onClick={carregarTudo}>
            Tentar novamente
          </button>
        </div>
      )}

      {!carregando && !erro && (
        <>
          {/* ===================================================
              ABA 1: REVENDEDORAS
          =================================================== */}
          {abaAtiva === 'revendedoras' && (
            <div className="revendas-conteudo-bloco">
              <div className="revendas-toolbar">
                <div className="busca-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar revendedora por nome, cidade, telefone..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>

                <div className="filtros-wrap">
                  <select
                    value={filtroStatusRev}
                    onChange={(e) => setFiltroStatusRev(e.target.value)}
                  >
                    <option value="todos">Todos os status</option>
                    <option value="Ativa">Ativa</option>
                    <option value="Pausada">Pausada</option>
                    <option value="Encerrada">Encerrada</option>
                  </select>
                </div>
              </div>

              {revendedorasFiltradas.length === 0 ? (
                <div className="revendas-vazio">
                  <p>Nenhuma revendedora encontrada.</p>
                  <button type="button" className="btn-acao-header primario" onClick={abrirModalNovaRevendedora}>
                    Cadastrar primeira revendedora
                  </button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="revendas-tabela">
                    <thead>
                      <tr>
                        <th>Revendedora</th>
                        <th>Comissão</th>
                        <th>Periodicidade</th>
                        <th>Em Consignação</th>
                        <th>Vendido</th>
                        <th>Saldo a Receber</th>
                        <th>Próximo Acerto</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revendedorasFiltradas.map((rev) => (
                        <tr key={rev.id}>
                          <td>
                            <div className="revendedora-nome-col">
                              <strong>{rev.nome}</strong>
                              <small>
                                {[rev.cidade, rev.estado].filter(Boolean).join(' - ') || 'Brasil'} •{' '}
                                {formatarTelefone(rev.whatsapp || rev.telefone)}
                              </small>
                            </div>
                          </td>
                          <td>
                            <span className="badge-comissao">{rev.comissao_padrao}%</span>
                          </td>
                          <td>A cada {rev.periodicidade_acerto_dias || 15} dias</td>
                          <td>
                            <strong>{rev.pecasConsignadas} un.</strong>
                            <small className="tabela-sub-valor">{formatarMoeda(rev.valorConsignado)}</small>
                          </td>
                          <td>
                            <strong>{formatarMoeda(rev.totalVendidoBruto)}</strong>
                            <small className="tabela-sub-valor">Comissão: {formatarMoeda(rev.totalComissao)}</small>
                          </td>
                          <td>
                            <strong className={rev.saldoPendente > 0 ? 'text-pendente' : 'text-zerado'}>
                              {formatarMoeda(rev.saldoPendente)}
                            </strong>
                          </td>
                          <td>
                            <span>{new Date(rev.proximoAcerto).toLocaleDateString('pt-BR')}</span>
                            {rev.atrasado && <span className="badge-atrasado">Atrasado</span>}
                          </td>
                          <td>
                            <span className={`status-badge status-${rev.status?.toLowerCase()}`}>
                              {rev.status}
                            </span>
                          </td>
                          <td>
                            <div className="acoes-btn-grupo">
                              <button
                                type="button"
                                className="btn-tabela-acao"
                                onClick={() => abrirDetalhesRevendedora(rev)}
                              >
                                Ver
                              </button>
                              <button
                                type="button"
                                className="btn-tabela-acao"
                                onClick={() => abrirModalNovaRemessa(rev.id)}
                              >
                                + Remessa
                              </button>
                              <button
                                type="button"
                                className="btn-tabela-acao destaque"
                                onClick={() => abrirModalPagamento(rev.id)}
                              >
                                Acerto
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===================================================
              ABA 2: REMESSAS CONSIGNADAS
          =================================================== */}
          {abaAtiva === 'remessas' && (
            <div className="revendas-conteudo-bloco">
              <div className="bloco-header-acoes">
                <div>
                  <h2>Remessas de Mercadoria</h2>
                  <p>Acompanhe o estoque consignado em trânsito com cada revendedora.</p>
                </div>
                <button type="button" className="btn-acao-header primario" onClick={() => abrirModalNovaRemessa()}>
                  + Nova Remessa
                </button>
              </div>

              {remessas.length === 0 ? (
                <div className="revendas-vazio">
                  <p>Nenhuma remessa registrada ainda.</p>
                </div>
              ) : (
                <div className="remessas-cards-lista">
                  {remessas.map((rem) => {
                    const totalEnviadas = rem.itens.reduce((acc, i) => acc + (i.quantidade_enviada || 0), 0)
                    const totalVendidas = rem.itens.reduce((acc, i) => acc + (i.quantidade_vendida || 0), 0)
                    const totalDevolvidas = rem.itens.reduce((acc, i) => acc + (i.quantidade_devolvida || 0), 0)
                    const saldoConsignado = totalEnviadas - totalVendidas - totalDevolvidas

                    return (
                      <div key={rem.id} className="remessa-card">
                        <div className="remessa-card-topo">
                          <div>
                            <span className="remessa-numero">{rem.numero}</span>
                            <strong>{rem.revendedora_nome}</strong>
                            <small>{new Date(rem.data_envio || rem.criado_em).toLocaleDateString('pt-BR')}</small>
                          </div>
                          <div className="remessa-card-stats">
                            <div>
                              <span>Enviadas</span>
                              <strong>{totalEnviadas} un.</strong>
                            </div>
                            <div>
                              <span>Saldo com ela</span>
                              <strong className="text-destaque-saldo">{saldoConsignado} un.</strong>
                            </div>
                            <div>
                              <span>Vendidas</span>
                              <strong>{totalVendidas} un.</strong>
                            </div>
                            <div>
                              <span>Devolvidas</span>
                              <strong>{totalDevolvidas} un.</strong>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                              <span className="status-badge status-enviada">{rem.status}</span>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn-tabela-acao"
                                  style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#234B36', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  onClick={() => abrirModalEditarRemessa(rem)}
                                >
                                  ✏ Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn-tabela-acao"
                                  style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  onClick={() => abrirModalExcluirRemessa(rem)}
                                >
                                  🗑 Excluir
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* TABELA DE ITENS DA REMESSA */}
                        <div className="remessa-itens-tabela-wrap">
                          <table className="remessa-itens-tabela">
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th>Tam</th>
                                <th>Enviada</th>
                                <th>Vendida</th>
                                <th>Devolvida</th>
                                <th>Saldo</th>
                                <th>Valor de Repasse</th>
                                <th>Valor da Venda</th>
                                <th>Comissão</th>
                                <th>Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rem.itens.map((item) => {
                                const saldoItem = calcularSaldoConsignadoItem(item)
                                return (
                                  <tr key={item.id}>
                                    <td>
                                      <strong>{item.produto_nome}</strong>
                                      {item.cor && <small style={{ display: 'block', color: '#6b7280' }}>Cor: {item.cor}</small>}
                                    </td>
                                    <td>{item.tamanho || 'U'}</td>
                                    <td>{item.quantidade_enviada}</td>
                                    <td>{item.quantidade_vendida}</td>
                                    <td>{item.quantidade_devolvida}</td>
                                    <td><strong>{saldoItem}</strong></td>
                                    <td>{formatarMoeda(item.preco_venda_sugerido)}</td>
                                    <td>
                                      {(() => {
                                        const totalVendido = obterTotalValorVendidoItem(item.id, vendas)
                                        if (totalVendido > 0) {
                                          return (
                                            <strong style={{ color: '#166534', fontSize: '0.9rem' }}>
                                              {formatarMoeda(totalVendido)}
                                            </strong>
                                          )
                                        }
                                        return (
                                          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                                            R$ 0,00
                                          </span>
                                        )
                                      })()}
                                    </td>
                                    <td>{item.comissao_percentual}%</td>
                                    <td>
                                      {saldoItem > 0 ? (
                                        <div className="acoes-item-grupo">
                                          <button
                                            type="button"
                                            className="btn-item-venda"
                                            onClick={() => abrirModalVenda(item)}
                                          >
                                            Venda
                                          </button>
                                          <button
                                            type="button"
                                            className="btn-item-devolucao"
                                            onClick={() => abrirModalDevolucao(item)}
                                          >
                                            Devolução
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="item-liquidado">Liquidado</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================================================
              ABA 3: ACERTOS & FINANCEIRO (PAINEL ADMINISTRATIVO)
          =================================================== */}
          {abaAtiva === 'acertos' && (
            <div className="revendas-conteudo-bloco">
              <div className="bloco-header-acoes">
                <div>
                  <h2>Painel Financeiro & Acertos</h2>
                  <p>Visão consolidada da operação, apuração de custos reais, comissões, divisão de lucros e acertos com revendedoras.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-secundario" onClick={carregarTudo}>
                    ↻ Atualizar
                  </button>
                  <button type="button" className="btn-acao-header primario" onClick={() => abrirModalPagamento()}>
                    + Registrar Pagamento
                  </button>
                </div>
              </div>

              {/* ===================================================
                  BARRA DE FILTROS (REVENDEDORA, REMESSA, PERÍODO)
              =================================================== */}
              <div className="filtros-financeiros-wrap">
                <div className="filtro-item">
                  <label>Revendedora</label>
                  <select
                    value={filtroAcertoRevendedoraId}
                    onChange={(e) => {
                      setFiltroAcertoRevendedoraId(e.target.value)
                      setFiltroAcertoRemessaId('todas')
                    }}
                  >
                    <option value="todas">Todas as Revendedoras</option>
                    {revendedoras.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome} {r.usa_divisao_lucro ? `(${r.percentual_lucro_revendedora}% Lucro)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filtro-item">
                  <label>Remessa</label>
                  <select
                    value={filtroAcertoRemessaId}
                    onChange={(e) => setFiltroAcertoRemessaId(e.target.value)}
                  >
                    <option value="todas">Todas as Remessas</option>
                    {remessasDisponiveisFiltro.map((rem) => (
                      <option key={rem.id} value={rem.id}>
                        {rem.numero || `REM-${String(rem.id).padStart(6, '0')}`} {rem.revendedora_nome ? `(${rem.revendedora_nome})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filtro-item">
                  <label>Período</label>
                  <select
                    value={filtroAcertoPeriodo}
                    onChange={(e) => setFiltroAcertoPeriodo(e.target.value)}
                  >
                    <option value="todos">Todos os Períodos</option>
                    <option value="mes_atual">Este Mês</option>
                    <option value="mes_anterior">Mês Anterior</option>
                    <option value="personalizado">Personalizado</option>
                  </select>
                </div>

                {filtroAcertoPeriodo === 'personalizado' && (
                  <>
                    <div className="filtro-item" style={{ minWidth: '140px' }}>
                      <label>Data Início</label>
                      <input
                        type="date"
                        value={filtroAcertoDataInicio}
                        onChange={(e) => setFiltroAcertoDataInicio(e.target.value)}
                      />
                    </div>
                    <div className="filtro-item" style={{ minWidth: '140px' }}>
                      <label>Data Fim</label>
                      <input
                        type="date"
                        value={filtroAcertoDataFim}
                        onChange={(e) => setFiltroAcertoDataFim(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {(filtroAcertoRevendedoraId !== 'todas' || filtroAcertoRemessaId !== 'todas' || filtroAcertoPeriodo !== 'todos') && (
                  <button
                    type="button"
                    className="btn-limpar-filtros"
                    onClick={() => {
                      setFiltroAcertoRevendedoraId('todas')
                      setFiltroAcertoRemessaId('todas')
                      setFiltroAcertoPeriodo('todos')
                      setFiltroAcertoDataInicio('')
                      setFiltroAcertoDataFim('')
                    }}
                  >
                    ✕ Limpar Filtros
                  </button>
                )}
              </div>

              {/* ===================================================
                  BLOCO DUPLO EXECUTIVO: DIVISÃO DO RESULTADO & ACERTO FINANCEIRO
              =================================================== */}
              <div className="bloco-duplo-financeiro">
                {/* BLOCO 1: DIVISÃO DO RESULTADO ECONÔMICO REAL DO BAZAR */}
                <div className="card-bloco-resultado">
                  <h3>
                    <span>Divisão do Resultado Econômico</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>
                      Visão Real do Negócio (Custo Real)
                    </span>
                  </h3>

                  <div className="resultado-linhas-lista">
                    <div className="resultado-linha-item">
                      <span>Venda Líquida:</span>
                      <strong>{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.vendaLiquida)}</strong>
                    </div>
                    <div className="resultado-linha-item">
                      <span>(-) Custo Real das Mercadorias:</span>
                      <span>{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.custoReal)}</span>
                    </div>
                    {painelFinanceiro.divisaoEconomicaReal.freteOperacional > 0 && (
                      <div className="resultado-linha-item">
                        <span>(-) Frete / Custo Operacional Real:</span>
                        <span>{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.freteOperacional)}</span>
                      </div>
                    )}
                    <div className="resultado-linha-item">
                      <span>(-) Comissão da Revendedora:</span>
                      <span>{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.comissao)}</span>
                    </div>
                    <div className="resultado-linha-item">
                      <span>(-) Participação da Revendedora ({painelFinanceiro.divisaoEconomicaReal.percRevendedora}% do Consolidado):</span>
                      <span style={{ color: '#92400e', fontWeight: 600 }}>{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.parteRevendedora)}</span>
                    </div>
                    <div className="resultado-linha-item" style={{ background: '#faf6ef', padding: '8px 10px', borderRadius: '6px' }}>
                      <strong>(=) LUCRO REAL DO BAZAR:</strong>
                      <strong style={{ color: painelFinanceiro.divisaoEconomicaReal.lucroRealBazar >= 0 ? '#15803d' : '#b91c1c', fontSize: '15px' }}>
                        {formatarMoeda(painelFinanceiro.divisaoEconomicaReal.lucroRealBazar)}
                      </strong>
                    </div>

                    <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                      <span>Margem Real do Bazar:</span>
                      <strong>{painelFinanceiro.divisaoEconomicaReal.margemRealBazar.toFixed(2)}%</strong>
                    </div>

                    <div style={{ marginTop: '4px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
                      <div className="resultado-linha-item">
                        <span>Custo Real Recuperado pelo Bazar:</span>
                        <span>+{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.custoRecuperado)}</span>
                      </div>
                      <div className="resultado-linha-item total-destaque" style={{ color: '#166534' }}>
                        <span>★ TOTAL ECONÔMICO DO BAZAR (Custo + Lucro):</span>
                        <strong>{formatarMoeda(painelFinanceiro.divisaoEconomicaReal.totalRetidoBazar)}</strong>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px', marginTop: '8px', fontSize: '11px', color: '#4b5563' }}>
                      <div>💡 <strong>Transparência:</strong> Custo Real Recuperado ({formatarMoeda(painelFinanceiro.divisaoEconomicaReal.custoReal)}) ≠ Lucro Real do Bazar ({formatarMoeda(painelFinanceiro.divisaoEconomicaReal.lucroRealBazar)}).</div>
                    </div>
                  </div>
                </div>

                {/* BLOCO 2: RESULTADO CONSOLIDADO DA REVENDEDORA */}
                <div className="card-bloco-resultado">
                  <h3>
                    <span>Resultado Consolidado</span>
                    <span className={`badge-status-acerto ${painelFinanceiro.resultadoConsolidado.status === 'PAGO' ? 'pago' : painelFinanceiro.resultadoConsolidado.status === 'PARCIALMENTE PAGO' ? 'parcial' : 'aberto'}`}>
                      {painelFinanceiro.resultadoConsolidado.status}
                    </span>
                  </h3>

                  <div className="resultado-linhas-lista">
                    <div className="resultado-linha-item">
                      <span>Total de Vendas:</span>
                      <strong>{formatarMoeda(painelFinanceiro.resultadoConsolidado.totalVendas)}</strong>
                    </div>
                    <div className="resultado-linha-item">
                      <span>(-) Custo das Mercadorias:</span>
                      <span>{formatarMoeda(painelFinanceiro.resultadoConsolidado.custoRepasse)}</span>
                    </div>
                    <div className="resultado-linha-item">
                      <span>(-) Comissão Total:</span>
                      <span>{formatarMoeda(painelFinanceiro.resultadoConsolidado.totalComissao)}</span>
                    </div>
                    <div className="resultado-linha-item" style={{ background: '#faf6ef', padding: '8px 10px', borderRadius: '6px' }}>
                      <strong>(=) Lucro Líquido para Divisão:</strong>
                      <strong style={{ color: painelFinanceiro.resultadoConsolidado.lucroLiquido >= 0 ? '#166534' : '#b91c1c' }}>
                        {formatarMoeda(painelFinanceiro.resultadoConsolidado.lucroLiquido)}
                      </strong>
                    </div>

                    {/* DESTAQUE DA DIVISÃO DO LUCRO COMERCIAL */}
                    <div className="bloco-divisao-destaque">
                      <div className="bloco-divisao-header">
                        <span>Divisão do Lucro Líquido</span>
                        <span>Base: {formatarMoeda(painelFinanceiro.resultadoConsolidado.lucroLiquido)}</span>
                      </div>
                      <div className="bloco-divisao-grid">
                        <div className="bloco-divisao-card revendedora">
                          <div className="rotulo">
                            <span>REVENDEDORA</span>
                            <span>{painelFinanceiro.resultadoConsolidado.percRevendedora}%</span>
                          </div>
                          <div className="valor">
                            +{formatarMoeda(painelFinanceiro.resultadoConsolidado.parteRevendedora)}
                          </div>
                        </div>
                        <div className="bloco-divisao-card bazar">
                          <div className="rotulo">
                            <span>BAZAR</span>
                            <span>{painelFinanceiro.resultadoConsolidado.percBazar}%</span>
                          </div>
                          <div className="valor">
                            +{formatarMoeda(painelFinanceiro.resultadoConsolidado.parteBazar)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '4px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
                      <div className="resultado-linha-item" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                        <span>Total da Revendedora (Comissão + Participação):</span>
                        <strong>{formatarMoeda(painelFinanceiro.resultadoConsolidado.totalEconomicoRevendedora)}</strong>
                      </div>
                      <div className="resultado-linha-item">
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>VALOR DEVIDO AO BAZAR (Repasse + Parte Bazar):</span>
                        <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>
                          {formatarMoeda(painelFinanceiro.resultadoConsolidado.valorDevidoAoBazar)}
                        </strong>
                      </div>
                      <div className="resultado-linha-item">
                        <span>(-) Valor Pago (Confirmado):</span>
                        <strong style={{ color: '#15803d' }}>
                          -{formatarMoeda(painelFinanceiro.resultadoConsolidado.valorPago)}
                        </strong>
                      </div>
                      <div className="resultado-linha-item total-destaque" style={{ background: '#fffdf9', padding: '10px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                        <span style={{ color: '#92400e' }}>SALDO PENDENTE:</span>
                        <strong style={{ fontSize: '18px', color: '#9a3412' }}>
                          {formatarMoeda(painelFinanceiro.resultadoConsolidado.saldo)}
                        </strong>
                      </div>
                    </div>

                    {painelFinanceiro.resultadoConsolidado.valorPagamentoAguardando > 0 && (
                      <div style={{ marginTop: '10px', background: '#fef3c7', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '2px' }}>
                          🟡 Pagamento Aguardando Conferência: {formatarMoeda(painelFinanceiro.resultadoConsolidado.valorPagamentoAguardando)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#78350f' }}>
                          Saldo previsto após confirmação: <strong>{formatarMoeda(Math.max(0, painelFinanceiro.resultadoConsolidado.saldo - painelFinanceiro.resultadoConsolidado.valorPagamentoAguardando))}</strong>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn-salvar"
                        style={{ flex: 1, padding: '10px' }}
                        onClick={() => abrirModalPagamento(filtroAcertoRevendedoraId !== 'todas' ? filtroAcertoRevendedoraId : null)}
                      >
                        + Registrar Pagamento Manual
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ===================================================
                  BARRA DE INDICADORES EXTRAS (MÉTRICAS DA OPERAÇÃO)
              =================================================== */}
              <div className="indicadores-pills-bar">
                <div className="indicador-pill">
                  <span>Ticket Médio:</span>
                  <strong>{formatarMoeda(painelFinanceiro.ticketMedio)}</strong>
                </div>
                <div className="indicador-pill">
                  <span>Peças Vendidas:</span>
                  <strong>{painelFinanceiro.totalPecasVendidas} un.</strong>
                </div>
                <div className="indicador-pill">
                  <span>Preço Médio por Peça:</span>
                  <strong>{formatarMoeda(painelFinanceiro.precoMedioPeca)}</strong>
                </div>
                <div className="indicador-pill">
                  <span>Desconto Médio:</span>
                  <strong>{painelFinanceiro.descontoMedioPerc.toFixed(1)}%</strong>
                </div>
                <div className="indicador-pill">
                  <span>Margem Bruta da Operação:</span>
                  <strong>{painelFinanceiro.margemBruta.toFixed(2)}%</strong>
                </div>
                <div className="indicador-pill">
                  <span>Margem Pós-Comissão:</span>
                  <strong>{painelFinanceiro.margemAposComissao.toFixed(2)}%</strong>
                </div>
              </div>

              {/* ===================================================
                  TABELA: DETALHAMENTO DE VENDAS
              =================================================== */}
              <div className="sub-secao-financeira" style={{ marginBottom: '30px' }}>
                <div className="sub-secao-topo" style={{ marginBottom: '12px' }}>
                  <div>
                    <h3>Detalhamento das Vendas ({painelFinanceiro.vendasDetalhadas.length})</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
                      Transações comerciais com apuração de custo real de aquisição e partilha individual de lucros.
                    </p>
                  </div>
                </div>

                {painelFinanceiro.vendasDetalhadas.length === 0 ? (
                  <p className="revendas-sem-dados">Nenhuma venda confirmada para os filtros selecionados.</p>
                ) : (
                  <div className="tabela-scroll">
                    <table className="revendas-tabela">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Remessa</th>
                          <th>Revendedora</th>
                          <th>Produto</th>
                          <th>Qtd</th>
                          <th>Venda Bruta</th>
                          <th>Desconto</th>
                          <th>Venda Líquida</th>
                          <th>Custo Real</th>
                          <th>Comissão</th>
                          <th>Lucro Líquido</th>
                          <th>% Rev.</th>
                          <th>Parte Rev.</th>
                          <th>Parte Bazar</th>
                          <th>Margem %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {painelFinanceiro.vendasDetalhadas.map((v) => {
                          return (
                            <tr key={v.id}>
                              <td>
                                {formatarData(v.data_venda || v.criado_em)}
                                {v.data_recebimento && (
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary, #777)' }}>
                                    recebida {String(v.data_recebimento).slice(0, 10).split('-').reverse().join('/')}
                                  </div>
                                )}
                              </td>
                              <td><strong>{v.numero_remessa || v.revenda_remessas?.numero || (v.remessa_id ? `REM-${String(v.remessa_id).padStart(6, '0')}` : 'REM-000000')}</strong></td>
                              <td><strong>{v.revendedoras?.nome || 'Revendedora'}</strong></td>
                              <td>
                                {v.produto_nome}
                                {v.cor || v.tamanho ? ` (${[v.cor, v.tamanho].filter(Boolean).join(' | ')})` : ''}
                              </td>
                              <td><strong>{v.quantidade}</strong></td>
                              <td>{formatarMoeda(v.vendaBruta)}</td>
                              <td>
                                {v.valorDesconto > 0 ? (
                                  <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                                    {v.percentualDesconto > 0 ? `${v.percentualDesconto}% ` : ''}(-{formatarMoeda(v.valorDesconto)})
                                  </span>
                                ) : (
                                  <span style={{ color: '#9ca3af' }}>-</span>
                                )}
                              </td>
                              <td><strong>{formatarMoeda(v.vendaLiquida)}</strong></td>
                              <td><span>{formatarMoeda(v.custoReal)}</span></td>
                              <td>
                                <span className="badge-comissao-sm">{v.comissao_percentual}%</span> {formatarMoeda(v.comissao)}
                              </td>
                              <td>
                                <strong style={{ color: v.lucroOperacao >= 0 ? '#166534' : '#b91c1c' }}>
                                  {formatarMoeda(v.lucroOperacao)}
                                </strong>
                              </td>
                              <td>
                                {v.usaDivisao ? (
                                  <span style={{ fontWeight: 700, color: '#92400e' }}>{v.percRevendedora}%</span>
                                ) : (
                                  <span style={{ color: '#9ca3af' }}>0%</span>
                                )}
                              </td>
                              <td>
                                <span style={{ color: '#92400e', fontWeight: 600 }}>{formatarMoeda(v.parteRevendedoraLucro)}</span>
                              </td>
                              <td>
                                <strong style={{ color: '#15803d' }}>{formatarMoeda(v.parteBazarLucro)}</strong>
                              </td>
                              <td><span>{v.margemBazar.toFixed(1)}%</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ===================================================
                  HISTÓRICO DE PAGAMENTOS (CONFIRMADOS & PENDENTES)
              =================================================== */}
              <div className="sub-secao-financeira" style={{ marginTop: '30px' }}>
                <div className="sub-secao-topo" style={{ marginBottom: '12px' }}>
                  <div>
                    <h3>Pagamentos Confirmados ({painelFinanceiro.pagamentosConfirmadosList.length})</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
                      Repasses financeiros recebidos e confirmados que reduziram o saldo pendente.
                    </p>
                  </div>
                </div>

                {painelFinanceiro.pagamentosConfirmadosList.length === 0 ? (
                  <p className="revendas-sem-dados">Nenhum pagamento confirmado para o filtro selecionado.</p>
                ) : (
                  <div className="tabela-scroll">
                    <table className="revendas-tabela">
                      <thead>
                        <tr>
                          <th>Data Pagamento</th>
                          <th>Revendedora</th>
                          <th>Referência</th>
                          <th>Forma</th>
                          <th>Valor Confirmado</th>
                          <th>Observações</th>
                          <th>Confirmação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {painelFinanceiro.pagamentosConfirmadosList.map((p) => (
                          <tr key={p.id}>
                            <td>{formatarData(p.data_pagamento || p.criado_em)}</td>
                            <td><strong>{p.revendedoras?.nome || 'Revendedora'}</strong></td>
                            <td>
                              {p.revenda_remessas?.numero ? (
                                <span>Remessa {p.revenda_remessas.numero}</span>
                              ) : p.remessa_id ? (
                                <span>Remessa #{p.remessa_id}</span>
                              ) : (
                                <strong>Saldo Geral</strong>
                              )}
                            </td>
                            <td><span className="badge-forma-pag">{p.forma_pagamento || 'Pix'}</span></td>
                            <td><strong className="text-sucesso-valor">{formatarMoeda(p.valor_confirmado != null ? p.valor_confirmado : p.valor)}</strong></td>
                            <td>{p.observacao || '--'}</td>
                            <td>
                              {p.confirmado_em ? (
                                <span style={{ fontSize: '11px', color: '#15803d' }}>
                                  ✓ Confirmado em {formatarData(p.confirmado_em, true)}
                                </span>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#6b7280' }}>✓ Confirmado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {painelFinanceiro.pagamentosAguardandoList.length > 0 && (
                <div className="sub-secao-financeira" style={{ marginTop: '30px' }}>
                  <div className="sub-secao-topo" style={{ marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ color: '#b45309' }}>Pagamentos Aguardando Confirmação ({painelFinanceiro.pagamentosAguardandoList.length})</h3>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
                        Repasses informados pelas revendedoras no Portal aguardando validação do comprovante.
                      </p>
                    </div>
                  </div>

                  <div className="tabela-scroll">
                    <table className="revendas-tabela">
                      <thead>
                        <tr>
                          <th>Data Informada</th>
                          <th>Revendedora</th>
                          <th>Referência</th>
                          <th>Forma</th>
                          <th>Valor Informado</th>
                          <th>Observação</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {painelFinanceiro.pagamentosAguardandoList.map((p) => (
                          <tr key={p.id}>
                            <td>{formatarData(p.data_pagamento || p.criado_em)}</td>
                            <td><strong>{p.revendedoras?.nome || 'Revendedora'}</strong></td>
                            <td>
                              {p.revenda_remessas?.numero ? (
                                <span>Remessa {p.revenda_remessas.numero}</span>
                              ) : p.remessa_id ? (
                                <span>Remessa #{p.remessa_id}</span>
                              ) : (
                                <strong>Saldo Geral</strong>
                              )}
                            </td>
                            <td><span className="badge-forma-pag">{p.forma_pagamento || 'Pix'}</span></td>
                            <td><strong style={{ color: '#b45309' }}>{formatarMoeda(p.valor_informado || p.valor)}</strong></td>
                            <td>{p.observacao || '--'}</td>
                            <td>
                              <span className="badge-status-acerto parcial">AGUARDANDO CONFIRMAÇÃO</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-tabela-acao"
                                  style={{ color: 'var(--danger, #B85F4A)' }}
                                  onClick={() => handleAbrirRecusarPagamento(p)}
                                >
                                  Recusar
                                </button>
                                <button
                                  type="button"
                                  className="btn-tabela-acao destaque"
                                  onClick={() => handleAbrirConfirmarPagamento(p)}
                                >
                                  Confirmar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================================================
              ABA 4: PAGAMENTOS A CONFIRMAR
          =================================================== */}
          {abaAtiva === 'conferencia' && (
            <div className="revendas-conteudo-bloco">
              <div className="bloco-header-acoes">
                <div>
                  <h2>Pagamentos a Confirmar ({pagamentosAguardando.length})</h2>
                  <p>Repasses financeiros informados pelas revendedoras aguardando conferência administrativa.</p>
                </div>
                <button type="button" className="btn-secundario" onClick={carregarTudo}>
                  ↻ Atualizar
                </button>
              </div>

              {(!Array.isArray(pagamentosAguardando) || pagamentosAguardando.length === 0) ? (
                <div className="revendas-tabela-vazia">
                  <p>Nenhum pagamento aguardando confirmação.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
                  {(Array.isArray(pagamentosAguardando) ? pagamentosAguardando : []).map((p) => {
                    const listaRevs = Array.isArray(revendedoras) ? revendedoras : []
                    const rev = listaRevs.find((r) => Number(r?.id) === Number(p?.revendedora_id))
                    const saldoRev = Number(rev?.saldoPendente || 0)
                    const valorInf = Number(p?.valor_informado != null ? p.valor_informado : p?.valor || 0)
                    const remessaNum = p?.revenda_remessas?.numero || (p?.remessa_id ? `REM-${p.remessa_id}` : null)
                    const nomeRev = p?.revendedoras?.nome || rev?.nome || 'Revendedora'
                    const telRev = p?.revendedoras?.whatsapp || p?.revendedoras?.telefone || rev?.whatsapp || rev?.telefone || ''

                    return (
                      <div
                        key={p?.id || Math.random()}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderLeft: '4px solid var(--warning, #B8893F)',
                          borderRadius: '10px',
                          padding: '16px 20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>
                              {nomeRev}
                            </strong>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Telefone/WhatsApp: {formatarTelefone(telRev)}
                              {remessaNum ? (
                                <span> • Referente à Remessa: <strong>{remessaNum}</strong></span>
                              ) : (
                                <span> • Referente ao <strong>Saldo Geral</strong></span>
                              )}
                            </div>
                          </div>
                          <span style={{
                            background: 'var(--warning-light, #F5EAD2)',
                            color: '#8c5b16',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            textTransform: 'uppercase'
                          }}>
                            AGUARDANDO CONFIRMAÇÃO
                          </span>
                        </div>

                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '16px',
                          fontSize: '13px',
                          background: '#faf6ef',
                          padding: '12px 16px',
                          borderRadius: '6px'
                        }}>
                          <span>Valor Informado: <strong style={{ fontSize: '16px', color: 'var(--primary)' }}>{formatarMoeda(valorInf)}</strong></span>
                          <span>Saldo Devido da Revendedora: <strong>{formatarMoeda(saldoRev)}</strong></span>
                          <span>Forma: <strong>{p?.forma_pagamento || 'Pix'}</strong></span>
                          <span>Data do Pagamento: <strong>{p?.data_pagamento ? formatarData(p.data_pagamento) : 'Hoje'}</strong></span>
                        </div>

                        {p?.observacao && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            Observação informada pela revendedora: "{p.observacao}"
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '4px' }}>
                          <button
                            type="button"
                            className="btn-excluir"
                            style={{ background: 'transparent', color: 'var(--danger, #B85F4A)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                            onClick={() => handleAbrirRecusarPagamento(p)}
                            disabled={processandoPagamento}
                          >
                            ✕ Recusar / Não Localizado
                          </button>
                          <button
                            type="button"
                            className="btn-salvar"
                            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 700 }}
                            onClick={() => handleAbrirConfirmarPagamento(p)}
                            disabled={processandoPagamento}
                          >
                            ✓ Confirmar Pagamento
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===================================================
          MODAL: NOVA / EDITAR REVENDEDORA
      =================================================== */}
      {modalRevendedoraAberta && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalRevendedoraAberta(false)}>✕</button>
            <h2>{revendedoraEmEdicao ? 'Editar Revendedora' : 'Nova Revendedora'}</h2>
            <form onSubmit={handleSalvarRevendedora} className="revendas-form-grid">
              <div className="form-campo full">
                <label>Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={formRev.nome}
                  onChange={(e) => setFormRev({ ...formRev, nome: e.target.value })}
                  placeholder="Ex: Maria Silva"
                />
              </div>

              <div className="form-campo">
                <label>WhatsApp / Telefone</label>
                <input
                  type="text"
                  value={formRev.whatsapp}
                  onChange={(e) => setFormRev({ ...formRev, whatsapp: e.target.value, telefone: e.target.value })}
                  placeholder="(21) 98888-7777"
                />
              </div>

              <div className="form-campo">
                <label>E-mail</label>
                <input
                  type="email"
                  value={formRev.email}
                  onChange={(e) => setFormRev({ ...formRev, email: e.target.value })}
                  placeholder="maria@email.com"
                />
              </div>

              <div className="form-campo">
                <label>Comissão Padrão (%) * (0 a 100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  required
                  value={formRev.comissao_padrao}
                  onChange={(e) => setFormRev({ ...formRev, comissao_padrao: e.target.value })}
                />
              </div>

              <div className="form-campo">
                <label>Periodicidade de Acerto (dias)</label>
                <select
                  value={formRev.periodicidade_acerto_dias}
                  onChange={(e) => setFormRev({ ...formRev, periodicidade_acerto_dias: Number(e.target.value) })}
                >
                  <option value={7}>Semanal (7 dias)</option>
                  <option value={15}>Quinzenal (15 dias)</option>
                  <option value={30}>Mensal (30 dias)</option>
                </select>
              </div>

              <div className="form-campo">
                <label>Cidade</label>
                <input
                  type="text"
                  value={formRev.cidade}
                  onChange={(e) => setFormRev({ ...formRev, cidade: e.target.value })}
                />
              </div>

              <div className="form-campo">
                <label>Estado (UF)</label>
                <input
                  type="text"
                  maxLength="2"
                  value={formRev.estado}
                  onChange={(e) => setFormRev({ ...formRev, estado: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="form-campo full">
                <label>Status</label>
                <select
                  value={formRev.status}
                  onChange={(e) => setFormRev({ ...formRev, status: e.target.value })}
                >
                  <option value="Ativa">Ativa</option>
                  <option value="Pausada">Pausada</option>
                  <option value="Encerrada">Encerrada</option>
                </select>
              </div>

              <div className="form-campo full" style={{
                background: '#F9F6F0',
                border: '1px solid #E5DDCF',
                borderRadius: '8px',
                padding: '16px',
                marginTop: '10px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#173626', marginBottom: '8px' }}>
                  DIVISÃO ESPECIAL DO LUCRO
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="rev-usa-divisao"
                    checked={formRev.usa_divisao_lucro}
                    onChange={(e) => setFormRev({ ...formRev, usa_divisao_lucro: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="rev-usa-divisao" style={{ fontWeight: 700, margin: 0, cursor: 'pointer', color: '#173626' }}>
                    Ativar divisão especial de lucro
                  </label>
                </div>
                <small style={{ display: 'block', color: '#6E746B', fontSize: '12px', marginTop: '4px' }}>
                  Além da comissão padrão, divide o lucro líquido da operação (Vendas - Custo - Comissão) entre a Revendedora e o Bazar.
                </small>

                {formRev.usa_divisao_lucro && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Percentual da Revendedora:
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          placeholder="Informe o % (ex: 40)"
                          value={formRev.percentual_lucro_revendedora}
                          onChange={(e) => {
                            const valStr = e.target.value
                            if (valStr === '') {
                              setFormRev({ ...formRev, percentual_lucro_revendedora: '' })
                              return
                            }
                            const valNum = Math.min(100, Math.max(0, parseFloat(valStr) || 0))
                            setFormRev({ ...formRev, percentual_lucro_revendedora: valNum })
                          }}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>%</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Percentual do Bazar:
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={
                            formRev.percentual_lucro_revendedora !== '' && !isNaN(Number(formRev.percentual_lucro_revendedora))
                              ? (100 - Number(formRev.percentual_lucro_revendedora)).toFixed(2)
                              : 'automático'
                          }
                          style={{ flex: 1, background: '#ECE6DA', color: '#555', cursor: 'not-allowed' }}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>%</span>
                      </div>
                      <small style={{ fontSize: '11px', color: '#6E746B', display: 'block', marginTop: '2px' }}>
                        Calculado automaticamente: 100 - Percentual Revendedora
                      </small>
                    </div>
                  </div>
                )}
              </div>

              {revendedoraEmEdicao && (
                <div className="form-campo full" style={{
                  background: '#faf6ef',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginTop: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--primary)' }}>
                      🔑 Acesso ao Portal da Revendedora
                    </strong>
                    {carregandoAcesso ? (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Verificando...</span>
                    ) : (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: acessoPortalInfo?.status_acesso === 'ATIVO' ? 'var(--success-light, #E8EEE2)' : acessoPortalInfo?.status_acesso === 'BLOQUEADO' ? 'var(--danger-light, #F5E3DE)' : '#eee',
                        color: acessoPortalInfo?.status_acesso === 'ATIVO' ? 'var(--success, #56745A)' : acessoPortalInfo?.status_acesso === 'BLOQUEADO' ? 'var(--danger, #B85F4A)' : '#666'
                      }}>
                        {acessoPortalInfo?.status_acesso === 'ATIVO' ? 'ATIVO' : acessoPortalInfo?.status_acesso === 'BLOQUEADO' ? 'BLOQUEADO' : 'SEM ACESSO'}
                      </span>
                    )}
                  </div>

                  {acessoPortalInfo?.status_acesso === 'ATIVO' ? (
                    <div>
                      <p style={{ fontSize: '13px', margin: '0 0 10px', color: 'var(--text)' }}>
                        E-mail de login: <strong>{acessoPortalInfo.email || formRev.email}</strong>
                        {acessoPortalInfo.auth?.ultimo_acesso && (
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Último acesso: {new Date(acessoPortalInfo.auth.ultimo_acesso).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-secundario"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={handleRedefinirSenhaPortal}
                          disabled={salvandoAcesso}
                        >
                          Redefinir Senha
                        </button>
                        <button
                          type="button"
                          style={{
                            background: 'transparent',
                            color: 'var(--danger, #B85F4A)',
                            border: '1px solid var(--border)',
                            padding: '6px 12px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleAlterarStatusAcessoPortal('BLOQUEADO')}
                          disabled={salvandoAcesso}
                        >
                          Bloquear Acesso
                        </button>
                      </div>
                    </div>
                  ) : acessoPortalInfo?.status_acesso === 'BLOQUEADO' ? (
                    <div>
                      <p style={{ fontSize: '13px', margin: '0 0 10px', color: 'var(--danger, #B85F4A)' }}>
                        O acesso ao portal desta revendedora está atualmente BLOQUEADO.
                      </p>
                      <button
                        type="button"
                        className="btn-salvar"
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                        onClick={() => handleAlterarStatusAcessoPortal('ATIVO')}
                        disabled={salvandoAcesso}
                      >
                        Desbloquear Acesso
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                        Esta revendedora ainda não possui login individual no Portal.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                        <input
                          type="email"
                          placeholder="E-mail de acesso"
                          value={formNovoAcesso.email}
                          onChange={(e) => setFormNovoAcesso({ ...formNovoAcesso, email: e.target.value })}
                          style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)' }}
                        />
                        <input
                          type="password"
                          placeholder="Senha provisória (mín. 6 car.)"
                          value={formNovoAcesso.senha}
                          onChange={(e) => setFormNovoAcesso({ ...formNovoAcesso, senha: e.target.value })}
                          style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)' }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-salvar"
                        style={{ padding: '8px 14px', fontSize: '12px' }}
                        onClick={handleCriarAcessoPortal}
                        disabled={salvandoAcesso}
                      >
                        {salvandoAcesso ? 'Criando...' : 'Criar Acesso ao Portal'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="form-acoes full">
                <button type="button" className="btn-cancelar" onClick={() => setModalRevendedoraAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">Salvar Revendedora</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: NOVA REMESSA (CONSIGNAÇÃO)
      =================================================== */}
      {modalRemessaAberta && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal remessa-larga">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalRemessaAberta(false)}>✕</button>
            <h2>Nova Remessa em Consignação</h2>
            <p className="modal-sub">O estoque loja será debitado e transferido para a revendedora selecionada.</p>

            <form onSubmit={handleCriarRemessa}>
              <div className="form-linha-tripla" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
                <div className="form-campo">
                  <label>Revendedora Destino *</label>
                  <select
                    required
                    value={formRemessa.revendedoraId}
                    onChange={(e) => setFormRemessa({ ...formRemessa, revendedoraId: e.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {revendedoras.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome} ({r.comissao_padrao}% comissão)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-campo">
                  <label>Responsável pelo Envio</label>
                  <input
                    type="text"
                    value={formRemessa.responsavel}
                    onChange={(e) => setFormRemessa({ ...formRemessa, responsavel: e.target.value })}
                    placeholder="Ex: Admin"
                  />
                </div>

                <div className="form-campo">
                  <label>Frete da Remessa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formRemessa.frete}
                    onChange={(e) => setFormRemessa({ ...formRemessa, frete: e.target.value })}
                    placeholder="Ex: 300,00"
                  />
                </div>
              </div>

              {/* RESUMO DINÂMICO DE RATEIO DE FRETE */}
              {(() => {
                const totalPecasNova = formRemessa.itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0)
                const freteTotalNova = Number(formRemessa.frete || 0)
                const freteUnitarioNova = calcularRateioFrete(freteTotalNova, totalPecasNova)
                return (
                  <div style={{ display: 'flex', gap: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginTop: '12px', marginBottom: '14px', fontSize: '13px', alignItems: 'center' }}>
                    <div><strong>Total de Peças:</strong> {totalPecasNova} un.</div>
                    <div><strong>Frete Total:</strong> {formatarMoeda(freteTotalNova)}</div>
                    <div>
                      <strong>Frete Rateado por Peça:</strong>{' '}
                      <span style={{ color: freteUnitarioNova > 0 ? 'var(--primary)' : '#6b7280', fontWeight: 700 }}>
                        {formatarMoeda(freteUnitarioNova)} / un.
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* LISTA DE ITENS DA REMESSA */}
              <div className="remessa-itens-editor">
                <div className="editor-topo">
                  <h3>Adicionar Modelo com Grade à Remessa</h3>
                </div>

                <SeletorItemRemessa
                  produtos={produtosLoja}
                  comissaoPadrao={
                    (() => {
                      const rev = revendedoras.find((r) => String(r.id) === String(formRemessa.revendedoraId))
                      return rev ? Number(rev.comissao_padrao ?? 20) : 20
                    })()
                  }
                  onAdicionarItens={(novosItens) => {
                    setFormRemessa((prev) => ({
                      ...prev,
                      itens: [...prev.itens, ...novosItens]
                    }))
                  }}
                  labelBotao="+ Adicionar Grade à Remessa"
                />

                <div className="remessa-tabela-itens-adicionados" style={{ marginTop: '16px' }}>
                  {(() => {
                    const gruposRemessa = agruparItensRemessaPorProdutoVariacao(formRemessa.itens)
                    const totalPecasNova = formRemessa.itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0)
                    const freteTotalNova = Number(formRemessa.frete || 0)
                    const freteUnitarioNova = calcularRateioFrete(freteTotalNova, totalPecasNova)

                    return (
                      <>
                        <h4 style={{ marginBottom: '10px' }}>Modelos na Remessa ({gruposRemessa.length} {gruposRemessa.length === 1 ? 'modelo' : 'modelos'} • {totalPecasNova} peças)</h4>
                        {gruposRemessa.length === 0 ? (
                          <p className="nenhum-item-aviso">Nenhum modelo adicionado ainda. Pesquise e adicione a grade de tamanhos acima.</p>
                        ) : (
                          <div className="remessa-blocos-produtos-lista">
                            {gruposRemessa.map((grupo) => {
                              const repBase = Number(grupo.valor_repasse_base || 0)
                              const repEfetivo = Number((repBase + freteUnitarioNova).toFixed(2))

                              return (
                                <div key={grupo.chave} className="remessa-bloco-produto-card">
                                  <div className="bloco-prod-topo">
                                    <div>
                                      <strong style={{ fontSize: '15px', color: '#173626' }}>{grupo.produto_nome}</strong>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', fontSize: '12px' }}>
                                        {grupo.cor && (
                                          <span className="badge-cor-tag">
                                            <span className="dot-cor" style={{ backgroundColor: grupo.cor_hex || '#b76e79' }} />
                                            {grupo.cor}
                                          </span>
                                        )}
                                        {grupo.sku && <span style={{ color: '#6b7280' }}>SKU: {grupo.sku}</span>}
                                        <span className="badge-total-pecas-bloco">{grupo.total_quantidade} {grupo.total_quantidade === 1 ? 'peça enviada' : 'peças enviadas'}</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="btn-remover-bloco-prod"
                                      onClick={() => removerGrupoRemessa(grupo.chave)}
                                      title="Remover modelo da remessa"
                                    >
                                      ✕ Remover Modelo
                                    </button>
                                  </div>

                                  {/* GRADE DE TAMANHOS COM QUANTIDADES */}
                                  <div className="bloco-prod-grade-linha">
                                    <div className="grade-linha-titulo">Tamanhos:</div>
                                    <div className="grade-chips-inputs">
                                      {grupo.grades.map((grade) => (
                                        <div key={grade.tamanho} className="chip-tam-input-box">
                                          <span className="chip-tam-nome">{grade.tamanho}</span>
                                          <input
                                            type="number"
                                            min="1"
                                            value={grade.quantidade}
                                            onChange={(e) => atualizarQuantidadeGradeRemessa(grupo.chave, grade.tamanho, e.target.value)}
                                            className="input-tam-mini"
                                          />
                                          <button
                                            type="button"
                                            className="btn-excluir-tam-mini"
                                            onClick={() => removerTamanhoGradeRemessa(grupo.chave, grade.tamanho)}
                                            title="Excluir este tamanho"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* CAMPOS FINANCEIROS DO BLOCO */}
                                  <div className="bloco-prod-financeiro-grid">
                                    <div className="campo-fin-mini">
                                      <label>Repasse Base:</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={repBase}
                                        onChange={(e) => atualizarValoresGrupoRemessa(grupo.chave, 'valor_repasse_base', e.target.value)}
                                      />
                                    </div>
                                    <div className="campo-fin-mini">
                                      <label>Frete Unit.:</label>
                                      <span style={{ fontWeight: 600, color: freteUnitarioNova > 0 ? 'var(--primary)' : '#6b7280' }}>
                                        {formatarMoeda(freteUnitarioNova)}
                                      </span>
                                    </div>
                                    <div className="campo-fin-mini">
                                      <label>Repasse Efetivo:</label>
                                      <strong style={{ color: 'var(--primary)' }}>{formatarMoeda(repEfetivo)}</strong>
                                    </div>
                                    <div className="campo-fin-mini">
                                      <label>Comissão (%):</label>
                                      <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        max="100"
                                        value={grupo.comissao_percentual}
                                        onChange={(e) => atualizarValoresGrupoRemessa(grupo.chave, 'comissao_percentual', e.target.value)}
                                      />
                                    </div>
                                    <div className="campo-fin-mini destaque">
                                      <label>Total do Modelo:</label>
                                      <strong>{formatarMoeda(grupo.total_quantidade * repEfetivo)}</strong>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              <div className="form-campo full" style={{ marginTop: '16px' }}>
                <label>Observações da Remessa</label>
                <textarea
                  rows="2"
                  value={formRemessa.observacao}
                  onChange={(e) => setFormRemessa({ ...formRemessa, observacao: e.target.value })}
                  placeholder="Ex: Entregue pessoalmente na loja; lote de vestidos de primavera."
                />
              </div>

              <div className="form-acoes full">
                <button type="button" className="btn-cancelar" onClick={() => setModalRemessaAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">Enviar Remessa Consignada</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: EDITAR REMESSA (CONSIGNAÇÃO)
      =================================================== */}
      {modalEditarRemessaAberta && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal remessa-larga">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalEditarRemessaAberta(false)}>✕</button>
            <h2>Editar Remessa {formEditarRemessa.numero}</h2>
            <p className="modal-sub">
              Revendedora: <strong>{formEditarRemessa.revendedoraNome}</strong> • Ajuste quantidades por tamanho, frete e valores de repasse com rateio automático.
            </p>

            <form onSubmit={handleSalvarEdicaoRemessa}>
              <div className="form-linha-tripla" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px' }}>
                <div className="form-campo">
                  <label>Responsável</label>
                  <input
                    type="text"
                    value={formEditarRemessa.responsavel}
                    onChange={(e) => setFormEditarRemessa({ ...formEditarRemessa, responsavel: e.target.value })}
                    placeholder="Ex: Admin"
                  />
                </div>

                <div className="form-campo">
                  <label>Frete da Remessa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formEditarRemessa.frete}
                    onChange={(e) => setFormEditarRemessa({ ...formEditarRemessa, frete: e.target.value })}
                    placeholder="Ex: 300,00"
                  />
                </div>

                <div className="form-campo">
                  <label>Observações da Remessa</label>
                  <input
                    type="text"
                    value={formEditarRemessa.observacao}
                    onChange={(e) => setFormEditarRemessa({ ...formEditarRemessa, observacao: e.target.value })}
                    placeholder="Observações da remessa"
                  />
                </div>
              </div>

              {/* RESUMO DINÂMICO DE RATEIO DE FRETE NA EDIÇÃO */}
              {(() => {
                const totalPecasEd = formEditarRemessa.itens.reduce((acc, i) => acc + Number(i.quantidade_enviada || 1), 0)
                const freteTotalEd = Number(formEditarRemessa.frete || 0)
                const freteUnitarioEd = calcularRateioFrete(freteTotalEd, totalPecasEd)
                return (
                  <div style={{ display: 'flex', gap: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginTop: '12px', marginBottom: '14px', fontSize: '13px', alignItems: 'center' }}>
                    <div><strong>Total de Peças:</strong> {totalPecasEd} un.</div>
                    <div><strong>Frete Total:</strong> {formatarMoeda(freteTotalEd)}</div>
                    <div>
                      <strong>Frete Rateado por Peça:</strong>{' '}
                      <span style={{ color: freteUnitarioEd > 0 ? 'var(--primary)' : '#6b7280', fontWeight: 700 }}>
                        {formatarMoeda(freteUnitarioEd)} / un.
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* LISTA DE ITENS DA REMESSA EM EDIÇÃO */}
              <div className="remessa-itens-editor">
                <div className="editor-topo">
                  <h3>Adicionar Outro Modelo com Grade à Remessa</h3>
                </div>

                <SeletorItemRemessa
                  produtos={produtosLoja}
                  comissaoPadrao={
                    (() => {
                      const rev = revendedoras.find((r) => String(r.id) === String(formEditarRemessa.revendedoraId))
                      return rev ? Number(rev.comissao_padrao ?? 20) : 20
                    })()
                  }
                  onAdicionarItens={(novosItens) => {
                    setFormEditarRemessa((prev) => ({
                      ...prev,
                      itens: [
                        ...prev.itens,
                        ...novosItens.map((novoItem) => ({
                          id: null,
                          ...novoItem,
                          quantidade_enviada: novoItem.quantidade,
                          quantidade_vendida: 0,
                          quantidade_devolvida: 0,
                          min_quantidade: 0,
                          valor_repasse_base: novoItem.valor_repasse_base || novoItem.preco_venda_sugerido,
                          frete_rateado_unitario: 0
                        }))
                      ]
                    }))
                  }}
                  labelBotao="+ Adicionar Grade de Modelo"
                />

                <div className="remessa-tabela-itens-adicionados" style={{ marginTop: '16px' }}>
                  {(() => {
                    const gruposEdicao = agruparItensRemessaPorProdutoVariacao(formEditarRemessa.itens)
                    const totalPecasEd = formEditarRemessa.itens.reduce((acc, i) => acc + Number(i.quantidade_enviada || 1), 0)
                    const freteTotalEd = Number(formEditarRemessa.frete || 0)
                    const freteUnitarioEd = calcularRateioFrete(freteTotalEd, totalPecasEd)

                    return (
                      <>
                        <h4 style={{ marginBottom: '10px' }}>Modelos na Remessa ({gruposEdicao.length} {gruposEdicao.length === 1 ? 'modelo' : 'modelos'} • {totalPecasEd} peças)</h4>
                        {gruposEdicao.length === 0 ? (
                          <p className="nenhum-item-aviso">Nenhum modelo na remessa.</p>
                        ) : (
                          <div className="remessa-blocos-produtos-lista">
                            {gruposEdicao.map((grupo) => {
                              const repBase = Number(grupo.valor_repasse_base || 0)
                              const repEfetivo = Number((repBase + freteUnitarioEd).toFixed(2))

                              return (
                                <div key={grupo.chave} className="remessa-bloco-produto-card">
                                  <div className="bloco-prod-topo">
                                    <div>
                                      <strong style={{ fontSize: '15px', color: '#173626' }}>{grupo.produto_nome}</strong>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', fontSize: '12px' }}>
                                        {grupo.cor && (
                                          <span className="badge-cor-tag">
                                            <span className="dot-cor" style={{ backgroundColor: grupo.cor_hex || '#b76e79' }} />
                                            {grupo.cor}
                                          </span>
                                        )}
                                        {grupo.sku && <span style={{ color: '#6b7280' }}>SKU: {grupo.sku}</span>}
                                        <span className="badge-total-pecas-bloco">{grupo.total_enviada} {grupo.total_enviada === 1 ? 'peça enviada' : 'peças enviadas'}</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="btn-remover-bloco-prod"
                                      onClick={() => removerGrupoEdicao(grupo.chave)}
                                      title="Remover modelo da remessa"
                                    >
                                      ✕ Remover Modelo
                                    </button>
                                  </div>

                                  {/* GRADE DE TAMANHOS COM QUANTIDADES */}
                                  <div className="bloco-prod-grade-linha">
                                    <div className="grade-linha-titulo">Tamanhos:</div>
                                    <div className="grade-chips-inputs">
                                      {grupo.grades.map((grade) => {
                                        const temMov = (grade.min_quantidade || 0) > 0
                                        return (
                                          <div key={grade.tamanho} className="chip-tam-input-box">
                                            <span className="chip-tam-nome">{grade.tamanho}</span>
                                            <input
                                              type="number"
                                              min={grade.min_quantidade > 0 ? grade.min_quantidade : 0}
                                              value={grade.quantidade_enviada}
                                              onChange={(e) => atualizarQuantidadeGradeEdicao(grupo.chave, grade.tamanho, e.target.value)}
                                              className="input-tam-mini"
                                            />
                                            {temMov && (
                                              <small style={{ fontSize: '10px', color: '#b45309' }}>
                                                (mín. {grade.min_quantidade})
                                              </small>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  {/* CAMPOS FINANCEIROS DO BLOCO */}
                                  <div className="bloco-prod-financeiro-grid">
                                    <div className="campo-fin-mini">
                                      <label>Repasse Base:</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={repBase}
                                        onChange={(e) => atualizarValoresGrupoEdicao(grupo.chave, 'valor_repasse_base', e.target.value)}
                                      />
                                    </div>
                                    <div className="campo-fin-mini">
                                      <label>Frete Unit.:</label>
                                      <span style={{ fontWeight: 600, color: freteUnitarioEd > 0 ? 'var(--primary)' : '#6b7280' }}>
                                        {formatarMoeda(freteUnitarioEd)}
                                      </span>
                                    </div>
                                    <div className="campo-fin-mini">
                                      <label>Repasse Efetivo:</label>
                                      <strong style={{ color: 'var(--primary)' }}>{formatarMoeda(repEfetivo)}</strong>
                                    </div>
                                    <div className="campo-fin-mini">
                                      <label>Comissão (%):</label>
                                      <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        max="100"
                                        value={grupo.comissao_percentual}
                                        onChange={(e) => atualizarValoresGrupoEdicao(grupo.chave, 'comissao_percentual', e.target.value)}
                                      />
                                    </div>
                                    <div className="campo-fin-mini destaque">
                                      <label>Total do Modelo:</label>
                                      <strong>{formatarMoeda(grupo.total_enviada * repEfetivo)}</strong>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              {erroEdicaoRemessa && (
                <div className="revendas-alerta-erro" style={{ marginTop: '12px' }}>
                  <span>⚠</span> {erroEdicaoRemessa}
                </div>
              )}

              <div className="form-acoes full" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-cancelar" onClick={() => setModalEditarRemessaAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">Salvar Alterações da Remessa</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE REMESSA
      =================================================== */}
      {modalExcluirRemessaAberta && remessaParaExcluir && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal" style={{ maxWidth: '500px' }}>
            <button
              type="button"
              className="btn-fechar-modal"
              disabled={excluindoRemessa}
              onClick={() => {
                if (!excluindoRemessa) {
                  setModalExcluirRemessaAberta(false)
                  setRemessaParaExcluir(null)
                  setErroExclusaoRemessa(null)
                }
              }}
            >
              ✕
            </button>
            <h2 style={{ color: '#b91c1c' }}>Excluir remessa {remessaParaExcluir.numero}?</h2>
            <p className="modal-sub">
              Revendedora: <strong>{remessaParaExcluir.revendedora_nome}</strong>
            </p>

            <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', padding: '12px 14px', margin: '14px 0', fontSize: '13px', color: '#991b1b', lineHeight: '1.5' }}>
              Esta ação removerá a remessa e seus itens, <strong>devolvendo todas as quantidades ao estoque da loja</strong>, desde que não existam vendas ou movimentações vinculadas.
            </div>

            {erroExclusaoRemessa && (
              <div className="revendas-alerta-erro" style={{ marginBottom: '14px' }}>
                <span>⚠</span> {erroExclusaoRemessa}
              </div>
            )}

            <div className="form-acoes full" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn-cancelar"
                disabled={excluindoRemessa}
                onClick={() => {
                  setModalExcluirRemessaAberta(false)
                  setRemessaParaExcluir(null)
                  setErroExclusaoRemessa(null)
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-salvar"
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                disabled={excluindoRemessa}
                onClick={handleConfirmarExclusaoRemessa}
              >
                {excluindoRemessa ? 'Excluindo...' : 'Excluir Remessa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: REGISTRAR VENDA CONSIGNADA (MÚLTIPLOS PREÇOS)
      =================================================== */}
      {modalVendaAberta && itemParaVenda && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal remessa-larga">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalVendaAberta(false)}>✕</button>
            <h2>Registrar Venda do Item</h2>

            <div className="venda-produto-resumo-box">
              <div className="venda-prod-info">
                <span className="venda-prod-nome">{itemParaVenda.produto_nome}</span>
                <span className="venda-prod-detalhes">
                  {[itemParaVenda.cor, itemParaVenda.tamanho].filter(Boolean).join(' | ') || 'Tamanho Único'}
                </span>
              </div>
              <div className="venda-prod-metas">
                <div>
                  <span>Valor de Repasse:</span>
                  <strong>{formatarMoeda(itemParaVenda.preco_venda_sugerido)}</strong>
                </div>
                <div>
                  <span>Quantidade disponível para acerto:</span>
                  <strong className="text-destaque-saldo">{calcularSaldoConsignadoItem(itemParaVenda)} un.</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleRegistrarVenda} className="revendas-venda-form">
              <div className="secao-vendas-realizadas">
                <div className="secao-vendas-topo">
                  <h3>VENDAS REALIZADAS</h3>
                  <button type="button" className="btn-add-outro-valor" onClick={adicionarLinhaVenda}>
                    + Adicionar outro valor
                  </button>
                </div>

                <div className="linhas-vendas-grid">
                  {linhasVenda.map((linha, idx) => (
                    <div key={idx} className="linha-venda-item">
                      <div className="campo-venda-qtd">
                        <label>Quantidade</label>
                        <input
                          type="number"
                          min="1"
                          max={calcularSaldoConsignadoItem(itemParaVenda)}
                          required
                          value={linha.quantidade}
                          onChange={(e) => atualizarLinhaVenda(idx, 'quantidade', e.target.value)}
                        />
                      </div>

                      <div className="campo-venda-preco">
                        <label>Valor da Venda/un. (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={linha.precoUnitario}
                          onChange={(e) => atualizarLinhaVenda(idx, 'precoUnitario', e.target.value)}
                        />
                      </div>

                      <div className="campo-venda-subtotal">
                        <label>Subtotal Venda</label>
                        <span>{formatarMoeda(Number(linha.quantidade || 0) * Number(linha.precoUnitario || 0))}</span>
                      </div>

                      <div className="campo-venda-subcomissao">
                        <label>Comissão ({itemParaVenda.comissao_percentual}%)</label>
                        <span className="text-comissao">
                          {(() => {
                            const itemSubtotal = Number(linha.quantidade || 0) * Number(linha.precoUnitario || 0)
                            const itemDesc = (itemSubtotal * Number(percentualDesconto || 0)) / 100
                            const itemTotal = itemSubtotal - itemDesc
                            // Comissão sempre sobre o total, mesmo pelo preço do repasse (regra desde 04/11/2026)
                            return formatarMoeda(
                              itemTotal <= 0
                                ? 0
                                : (itemTotal * Number(itemParaVenda.comissao_percentual || 0)) / 100
                            )
                          })()}
                        </span>
                      </div>

                      {linhasVenda.length > 1 && (
                        <button
                          type="button"
                          className="btn-remover-linha-venda"
                          onClick={() => removerLinhaVenda(idx)}
                          title="Remover este valor"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* SEÇÃO DESCONTO (%) */}
              <div className="secao-desconto-venda" style={{ marginTop: '14px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem', margin: 0 }}>Desconto (%) na Operação:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={percentualDesconto}
                      onChange={(e) => setPercentualDesconto(e.target.value)}
                      style={{ width: '80px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, textAlign: 'center', fontSize: '0.95rem' }}
                    />
                    <span style={{ fontWeight: 700, color: '#64748b' }}>%</span>
                  </div>
                </div>
                {Number(percentualDesconto) > 0 && (
                  <span style={{ fontSize: '0.85rem', color: '#b91c1c', fontWeight: 600 }}>
                    Valor do desconto: -{formatarMoeda(totaisVenda.valorDesconto)}
                  </span>
                )}
              </div>

              {erroValidacaoVenda && (
                <div className="revendas-alerta-erro">
                  <span>⚠</span> {erroValidacaoVenda}
                </div>
              )}

              {/* CARD DE SIMULAÇÃO CONSOLIDADA */}
              <div className="simulacao-venda-card full" style={{ marginTop: '12px' }}>
                <div className="simulacao-linha-destaque">
                  <span>Total de unidades:</span>
                  <strong>{totaisVenda.totalQuantidade} un.</strong>
                </div>
                <div className="simulacao-linha-destaque">
                  <span>Subtotal da Venda:</span>
                  <strong>{formatarMoeda(totaisVenda.subtotalVenda)}</strong>
                </div>
                {totaisVenda.percentualDesconto > 0 && (
                  <>
                    <div className="simulacao-linha-destaque">
                      <span>Desconto ({totaisVenda.percentualDesconto}%):</span>
                      <strong style={{ color: '#b91c1c' }}>-{formatarMoeda(totaisVenda.valorDesconto)}</strong>
                    </div>
                    <div className="simulacao-linha-destaque">
                      <span>Total da Venda:</span>
                      <strong style={{ color: '#166534', fontSize: '1.1rem' }}>{formatarMoeda(totaisVenda.totalVenda)}</strong>
                    </div>
                  </>
                )}
                <div className="simulacao-linha-destaque">
                  <span>Comissão ({itemParaVenda.comissao_percentual}%):</span>
                  <strong className="text-comissao">{formatarMoeda(totaisVenda.totalComissao)}</strong>
                </div>
                <div className="simulacao-linha-destaque">
                  <span>Valor Devido à Loja:</span>
                  <strong className="text-loja-receita">{formatarMoeda(totaisVenda.totalLoja)}</strong>
                </div>
              </div>

              <div className="form-linha-dupla" style={{ marginTop: '14px' }}>
                <div className="form-campo">
                  <label>Data da Venda</label>
                  <input
                    type="date"
                    required
                    value={formVenda.dataVenda}
                    onChange={(e) => setFormVenda({ ...formVenda, dataVenda: e.target.value })}
                  />
                </div>

                <div className="form-campo">
                  <label>Observações</label>
                  <input
                    type="text"
                    value={formVenda.observacao}
                    onChange={(e) => setFormVenda({ ...formVenda, observacao: e.target.value })}
                    placeholder="Ex: Vendas registradas no acerto"
                  />
                </div>
              </div>

              <div className="form-acoes full">
                <button type="button" className="btn-cancelar" onClick={() => setModalVendaAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">CONFIRMAR VENDAS</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: REGISTRAR DEVOLUÇÃO CONSIGNAÇÃO
      =================================================== */}
      {modalDevolucaoAberta && itemParaDevolucao && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalDevolucaoAberta(false)}>✕</button>
            <h2>Devolução de Peça Consignada</h2>
            <p className="modal-sub">
              Produto: <strong>{itemParaDevolucao.produto_nome}</strong> ({itemParaDevolucao.tamanho || 'U'}) • Com a revendedora: <strong>{calcularSaldoConsignadoItem(itemParaDevolucao)} un.</strong>
            </p>

            <form onSubmit={handleRegistrarDevolucao} className="revendas-form-grid">
              <div className="form-campo full">
                <label>Quantidade Devolvida</label>
                <input
                  type="number"
                  min="1"
                  max={calcularSaldoConsignadoItem(itemParaDevolucao)}
                  required
                  value={formDevolucao.quantidade}
                  onChange={(e) => setFormDevolucao({ ...formDevolucao, quantidade: Number(e.target.value) })}
                />
              </div>

              <div className="form-campo full">
                <label>Motivo da Devolução</label>
                <input
                  type="text"
                  value={formDevolucao.motivo}
                  onChange={(e) => setFormDevolucao({ ...formDevolucao, motivo: e.target.value })}
                  placeholder="Ex: Peça não vendida no ciclo quinzenal"
                />
              </div>

              <div className="aviso-retorno-estoque full">
                <span>ℹ</span> As peças devolvidas retornarão automaticamente ao estoque disponível da loja para venda online e física.
              </div>

              <div className="form-acoes full">
                <button type="button" className="btn-cancelar" onClick={() => setModalDevolucaoAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">Confirmar Devolução</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: REGISTRAR PAGAMENTO DE ACERTO
      =================================================== */}
      {modalPagamentoAberta && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalPagamentoAberta(false)}>✕</button>
            <h2>Registrar Pagamento de Acerto</h2>
            <p className="modal-sub">Abata valores devidos pela revendedora à loja (parcial ou total).</p>

            <form onSubmit={handleRegistrarPagamento} className="revendas-form-grid">
              <div className="form-campo full">
                <label>Revendedora *</label>
                <select
                  required
                  value={formPagamento.revendedoraId}
                  onChange={(e) => setFormPagamento({ ...formPagamento, revendedoraId: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {revendedoras.map((r) => {
                    const res = resumosRevendedoras.find((resRev) => resRev.id === r.id)
                    return (
                      <option key={r.id} value={r.id}>
                        {r.nome} (Saldo devedor: {formatarMoeda(res?.saldoPendente || 0)})
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="form-campo">
                <label>Valor Pago (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formPagamento.valor}
                  onChange={(e) => setFormPagamento({ ...formPagamento, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div className="form-campo">
                <label>Forma de Pagamento</label>
                <select
                  value={formPagamento.formaPagamento}
                  onChange={(e) => setFormPagamento({ ...formPagamento, formaPagamento: e.target.value })}
                >
                  <option value="Pix">Pix</option>
                  <option value="Transferência">Transferência Bancária</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="form-campo full">
                <label>Data do Pagamento</label>
                <input
                  type="date"
                  required
                  value={formPagamento.dataPagamento}
                  onChange={(e) => setFormPagamento({ ...formPagamento, dataPagamento: e.target.value })}
                />
              </div>

              <div className="form-campo full">
                <label>Observação / Comprovante</label>
                <input
                  type="text"
                  value={formPagamento.observacao}
                  onChange={(e) => setFormPagamento({ ...formPagamento, observacao: e.target.value })}
                  placeholder="Ex: Pix enviado no acerto quinzenal"
                />
              </div>

              <div className="form-acoes full">
                <button type="button" className="btn-cancelar" onClick={() => setModalPagamentoAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">Registrar Pagamento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: DETALHES COMPLETOS DA REVENDEDORA
      =================================================== */}
      {modalDetalhesRevAberta && revendedoraDetalhes && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal remessa-larga">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalDetalhesRevAberta(false)}>✕</button>
            <div className="detalhe-rev-header">
              <div>
                <h2>{revendedoraDetalhes.nome}</h2>
                <p>
                  {[revendedoraDetalhes.cidade, revendedoraDetalhes.estado].filter(Boolean).join(' - ')} •{' '}
                  Comissão: <strong>{revendedoraDetalhes.comissao_padrao}%</strong> • Acerto a cada{' '}
                  <strong>{revendedoraDetalhes.periodicidade_acerto_dias} dias</strong>
                </p>
              </div>
              <div className="detalhe-rev-botoes">
                {revendedoraDetalhes.whatsapp && (
                  <button
                    type="button"
                    className="btn-whatsapp-rev"
                    onClick={() => abrirWhatsApp(revendedoraDetalhes)}
                  >
                    💬 WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  className="btn-editar-rev"
                  onClick={() => {
                    setModalDetalhesRevAberta(false)
                    abrirEditarRevendedora(revendedoraDetalhes)
                  }}
                >
                  Editar Dados
                </button>
              </div>
            </div>

            {/* MINI MÉTRICAS DA REVENDEDORA */}
            <div className="detalhes-metricas-grid">
              <div className="mini-metric">
                <span>Peças em Consignação</span>
                <strong>{revendedoraDetalhes.pecasConsignadas} un.</strong>
                <small>{formatarMoeda(revendedoraDetalhes.valorConsignado)}</small>
              </div>
              <div className="mini-metric">
                <span>Total Vendido Bruto</span>
                <strong>{formatarMoeda(revendedoraDetalhes.totalVendidoBruto)}</strong>
                <small>Comissão: {formatarMoeda(revendedoraDetalhes.totalComissao)}</small>
              </div>
              <div className="mini-metric">
                <span>Valor Devido à Loja</span>
                <strong>{formatarMoeda(revendedoraDetalhes.totalDevidoLoja)}</strong>
              </div>
              <div className="mini-metric">
                <span>Total Já Pago</span>
                <strong>{formatarMoeda(revendedoraDetalhes.totalPago)}</strong>
              </div>
              <div className="mini-metric destaque">
                <span>Saldo Pendente a Receber</span>
                <strong className="text-destaque-saldo">{formatarMoeda(revendedoraDetalhes.saldoPendente)}</strong>
                <small>Próximo acerto: {new Date(revendedoraDetalhes.proximoAcerto).toLocaleDateString('pt-BR')}</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: CONFERIR / CORRIGIR VENDA DA REVENDEDORA
      =================================================== */}
      {modalConferenciaAberta && vendaEmConferencia && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal">
            <button
              type="button"
              className="btn-fechar-modal"
              onClick={() => {
                setModalConferenciaAberta(false)
                setVendaEmConferencia(null)
              }}
            >
              ✕
            </button>
            <h2>Conferir & Ajustar Venda</h2>
            <p className="modal-sub">
              Revendedora: <strong>{vendaEmConferencia.revendedoras?.nome || 'Revendedora'}</strong> • Peça: <strong>{vendaEmConferencia.produto_nome}</strong>
            </p>

            <form onSubmit={handleSalvarConfirmacaoComAjustes} className="revendas-form-grid">
              <div className="form-campo">
                <label>Quantidade *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formConferencia.quantidade}
                  onChange={(e) => setFormConferencia({ ...formConferencia, quantidade: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>

              <div className="form-campo">
                <label>Preço Unitário da Venda (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formConferencia.precoUnitario}
                  onChange={(e) => setFormConferencia({ ...formConferencia, precoUnitario: e.target.value })}
                />
              </div>

              <div className="form-campo">
                <label>Data da Venda</label>
                <input
                  type="date"
                  value={formConferencia.dataVenda}
                  onChange={(e) => setFormConferencia({ ...formConferencia, dataVenda: e.target.value })}
                />
              </div>

              <div className="form-campo">
                <label>Forma de Pagamento</label>
                <select
                  value={formConferencia.formaPagamento}
                  onChange={(e) => setFormConferencia({ ...formConferencia, formaPagamento: e.target.value })}
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="form-campo full">
                <label>Observação Administrativa</label>
                <input
                  type="text"
                  placeholder="Observação da conferência..."
                  value={formConferencia.observacao}
                  onChange={(e) => setFormConferencia({ ...formConferencia, observacao: e.target.value })}
                />
              </div>

              <div className="form-acoes full">
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => {
                    setModalConferenciaAberta(false)
                    setVendaEmConferencia(null)
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-salvar"
                  disabled={processandoConferencia}
                >
                  {processandoConferencia ? 'Confirmando...' : 'Salvar & Confirmar Venda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: RECUSAR VENDA DA REVENDEDORA
      =================================================== */}
      {modalRecusaAberta && vendaParaRecusa && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal">
            <button
              type="button"
              className="btn-fechar-modal"
              onClick={() => {
                setModalRecusaAberta(false)
                setVendaParaRecusa(null)
              }}
            >
              ✕
            </button>
            <h2 style={{ color: 'var(--danger, #B85F4A)' }}>Recusar Registro de Venda</h2>
            <p className="modal-sub">
              A venda de <strong>{vendaParaRecusa.produto_nome}</strong> ({vendaParaRecusa.quantidade} un.) será marcada como recusada e a peça reservada voltará imediatamente ao saldo disponível da revendedora.
            </p>

            <form onSubmit={handleConfirmarRecusa} className="revendas-form-grid">
              <div className="form-campo full">
                <label>Motivo da Recusa (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Peça devolvida pela cliente, valor incorreto, etc."
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                />
              </div>

              <div className="form-acoes full">
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => {
                    setModalRecusaAberta(false)
                    setVendaParaRecusa(null)
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--danger, #B85F4A)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  disabled={processandoConferencia}
                >
                  {processandoConferencia ? 'Recusando...' : 'Confirmar Recusa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: CONFIRMAR RECEBIMENTO DE PAGAMENTO (REPASSE)
      =================================================== */}
      {modalConfirmarPagamentoAberto && pagamentoEmConfirmacao && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal" style={{ maxWidth: '520px' }}>
            <button
              type="button"
              className="btn-fechar-modal"
              onClick={() => {
                setModalConfirmarPagamentoAberto(false)
                setPagamentoEmConfirmacao(null)
              }}
            >
              ✕
            </button>
            <h2>Confirmar Recebimento de Repasse</h2>
            <p className="modal-sub">
              Confira os dados do pagamento informado pela revendedora antes de validar.
            </p>

            <form onSubmit={handleSalvarConfirmacaoPagamento} className="revendas-form-grid">
              <div className="form-campo full" style={{ background: '#faf6ef', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                  Revendedora: <strong>{pagamentoEmConfirmacao.revendedoras?.nome || 'Revendedora'}</strong>
                </div>
                <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                  Valor Informado: <strong>{formatarMoeda(pagamentoEmConfirmacao.valor_informado || pagamentoEmConfirmacao.valor)}</strong>
                </div>
                <div style={{ fontSize: '13px' }}>
                  Forma: <strong>{pagamentoEmConfirmacao.forma_pagamento || 'Pix'}</strong> • Data: <strong>{pagamentoEmConfirmacao.data_pagamento ? formatarData(pagamentoEmConfirmacao.data_pagamento) : 'Hoje'}</strong>
                </div>
              </div>

              <div className="form-campo full">
                <label>Valor Efetivamente Recebido (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  style={{ fontSize: '18px', fontWeight: 700 }}
                  value={formConfirmarPag.valorConfirmado}
                  onChange={(e) => setFormConfirmarPag({ ...formConfirmarPag, valorConfirmado: e.target.value })}
                />
                <small style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Caso tenha havido diferença de centavos ou valor, corrija antes de confirmar.
                </small>
              </div>

              <div className="form-campo full">
                <label>Observação Interna / Conferência (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Conferido extrato bancário Bradesco"
                  value={formConfirmarPag.observacao}
                  onChange={(e) => setFormConfirmarPag({ ...formConfirmarPag, observacao: e.target.value })}
                />
              </div>

              <div className="form-acoes full">
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => {
                    setModalConfirmarPagamentoAberto(false)
                    setPagamentoEmConfirmacao(null)
                  }}
                  disabled={processandoPagamento}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-salvar"
                  disabled={processandoPagamento}
                >
                  {processandoPagamento ? 'Confirmando...' : '✓ Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: RECUSAR PAGAMENTO
      =================================================== */}
      {modalRecusarPagamentoAberto && pagamentoEmRecusa && (
        <div className="revendas-modal-overlay">
          <div className="revendas-modal" style={{ maxWidth: '480px' }}>
            <button
              type="button"
              className="btn-fechar-modal"
              onClick={() => {
                setModalRecusarPagamentoAberto(false)
                setPagamentoEmRecusa(null)
              }}
            >
              ✕
            </button>
            <h2 style={{ color: 'var(--danger, #B85F4A)' }}>Recusar Pagamento / Não Localizado</h2>
            <p className="modal-sub">
              O repasse informado de <strong>{formatarMoeda(pagamentoEmRecusa.valor_informado || pagamentoEmRecusa.valor)}</strong> será recusado e NÃO abaterá o saldo da revendedora.
            </p>

            <form onSubmit={handleSalvarRecusaPagamento} className="revendas-form-grid">
              <div className="form-campo full">
                <label>Motivo da Recusa *</label>
                <textarea
                  rows="3"
                  required
                  placeholder="Ex: PIX não localizado no extrato bancário nesta data e valor."
                  value={motivoRecusaPagamento}
                  onChange={(e) => setMotivoRecusaPagamento(e.target.value)}
                />
              </div>

              <div className="form-acoes full">
                <button
                  type="button"
                  className="btn-cancelar"
                  onClick={() => {
                    setModalRecusarPagamentoAberto(false)
                    setPagamentoEmRecusa(null)
                  }}
                  disabled={processandoPagamento}
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--danger, #B85F4A)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  disabled={processandoPagamento}
                >
                  {processandoPagamento ? 'Recusando...' : '✕ Confirmar Recusa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Revendas

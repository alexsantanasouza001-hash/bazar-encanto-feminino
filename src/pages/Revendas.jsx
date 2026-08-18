import { useEffect, useMemo, useState } from 'react'
import {
  carregarAcertosRevendas,
  carregarPagamentosRevendas,
  carregarProdutos,
  carregarRemessas,
  carregarRevendedoras,
  carregarVendasRevendas,
  criarRemessaConsignacao,
  registrarDevolucaoConsignada,
  registrarPagamentoRevenda,
  registrarVendaConsignada,
  salvarRevendedora
} from '../storage'
import {
  calcularComissao,
  calcularSaldoConsignadoItem,
  calcularValorLoja,
  consolidarResumoRevendedora,
  formatarMoeda,
  formatarTelefone
} from './revendasHelpers.js'
import './Revendas.css'

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
  const [modalVendaAberta, setModalVendaAberta] = useState(false)
  const [itemParaVenda, setItemParaVenda] = useState(null)
  const [modalDevolucaoAberta, setModalDevolucaoAberta] = useState(false)
  const [itemParaDevolucao, setItemParaDevolucao] = useState(null)
  const [modalPagamentoAberta, setModalPagamentoAberta] = useState(false)
  const [modalDetalhesRevAberta, setModalDetalhesRevAberta] = useState(false)
  const [revendedoraDetalhes, setRevendedoraDetalhes] = useState(null)

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
    data_inicio: new Date().toISOString().slice(0, 10),
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

  // Formulário Venda
  const [formVenda, setFormVenda] = useState({
    quantidade: 1,
    precoUnitario: 0,
    dataVenda: new Date().toISOString().slice(0, 10),
    observacao: ''
  })

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
    dataPagamento: new Date().toISOString().slice(0, 10),
    observacao: ''
  })

  async function carregarTudo() {
    try {
      setCarregando(true)
      setErro(null)
      const [revs, rems, vends, acs, pags, prods] = await Promise.all([
        carregarRevendedoras(),
        carregarRemessas(),
        carregarVendasRevendas(),
        carregarAcertosRevendas(),
        carregarPagamentosRevendas(),
        carregarProdutos(true)
      ])

      setRevendedoras(revs)
      setRemessas(rems)
      setVendas(vends)
      setAcertos(acs)
      setPagamentos(pags)
      setProdutosLoja(prods)
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
      data_inicio: new Date().toISOString().slice(0, 10),
      observacoes: '',
      status: 'Ativa'
    })
    setModalRevendedoraAberta(true)
  }

  function abrirEditarRevendedora(rev) {
    setRevendedoraEmEdicao(rev)
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
      data_inicio: rev.data_inicio || new Date().toISOString().slice(0, 10),
      observacoes: rev.observacoes || '',
      status: rev.status || 'Ativa'
    })
    setModalRevendedoraAberta(true)
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
      itens: []
    })
    setModalRemessaAberta(true)
  }

  function adicionarItemRemessa() {
    const revObj = revendedoras.find((r) => String(r.id) === String(formRemessa.revendedoraId))
    const comissaoPadrao = revObj ? Number(revObj.comissao_padrao || 20) : 20

    const primeiroProd = produtosLoja[0]
    const preco = primeiroProd ? Number(primeiroProd.venda || 0) : 0
    const tam = primeiroProd?.tamanhos?.[0]?.tamanho || ''
    const tamId = primeiroProd?.tamanhos?.[0]?.id || ''

    setFormRemessa((prev) => ({
      ...prev,
      itens: [
        ...prev.itens,
        {
          produto_id: primeiroProd ? String(primeiroProd.id) : '',
          produto_tamanho_id: tamId ? String(tamId) : '',
          tamanho: tam,
          quantidade: 1,
          preco_venda_sugerido: preco,
          comissao_percentual: comissaoPadrao
        }
      ]
    }))
  }

  function atualizarItemRemessa(index, campo, valor) {
    setFormRemessa((prev) => {
      const novosItens = [...prev.itens]
      const itemAtual = { ...novosItens[index], [campo]: valor }

      if (campo === 'produto_id') {
        const prod = produtosLoja.find((p) => String(p.id) === String(valor))
        if (prod) {
          itemAtual.preco_venda_sugerido = Number(prod.venda || 0)
          itemAtual.tamanho = prod.tamanhos?.[0]?.tamanho || ''
          itemAtual.produto_tamanho_id = prod.tamanhos?.[0]?.id ? String(prod.tamanhos[0].id) : ''
        }
      }

      if (campo === 'produto_tamanho_id') {
        const prod = produtosLoja.find((p) => String(p.id) === String(itemAtual.produto_id))
        const tamObj = prod?.tamanhos?.find((t) => String(t.id) === String(valor))
        if (tamObj) {
          itemAtual.tamanho = tamObj.tamanho
        }
      }

      novosItens[index] = itemAtual
      return { ...prev, itens: novosItens }
    })
  }

  function removerItemRemessa(index) {
    setFormRemessa((prev) => ({
      ...prev,
      itens: prev.itens.filter((_, idx) => idx !== index)
    }))
  }

  async function handleCriarRemessa(e) {
    e.preventDefault()
    if (!formRemessa.revendedoraId) {
      alert('Selecione a revendedora.')
      return
    }
    if (formRemessa.itens.length === 0) {
      alert('Adicione ao menos um item à remessa.')
      return
    }

    // Validações
    for (const item of formRemessa.itens) {
      if (!item.produto_id) {
        alert('Selecione o produto para todos os itens da remessa.')
        return
      }
      if (Number(item.quantidade) <= 0) {
        alert('A quantidade enviada deve ser maior que zero.')
        return
      }
    }

    const res = await criarRemessaConsignacao({
      revendedoraId: formRemessa.revendedoraId,
      itens: formRemessa.itens,
      observacao: formRemessa.observacao,
      responsavel: formRemessa.responsavel
    })

    if (res.sucesso) {
      setModalRemessaAberta(false)
      exibirSucesso(`Remessa ${res.numero} criada com sucesso! Estoque da loja foi atualizado.`)
      carregarTudo()
    } else {
      alert(res.mensagem || 'Erro ao criar remessa.')
    }
  }

  // Handlers Venda Consignada
  function abrirModalVenda(item) {
    setItemParaVenda(item)
    const saldo = calcularSaldoConsignadoItem(item)
    setFormVenda({
      quantidade: Math.min(1, saldo),
      precoUnitario: Number(item.preco_venda_sugerido || 0),
      dataVenda: new Date().toISOString().slice(0, 10),
      observacao: ''
    })
    setModalVendaAberta(true)
  }

  async function handleRegistrarVenda(e) {
    e.preventDefault()
    if (!itemParaVenda) return
    const saldo = calcularSaldoConsignadoItem(itemParaVenda)
    if (Number(formVenda.quantidade) > saldo) {
      alert(`Quantidade vendida não pode exceder o saldo em consignação (${saldo} peça(s)).`)
      return
    }

    const res = await registrarVendaConsignada({
      remessaItemId: itemParaVenda.id,
      quantidade: formVenda.quantidade,
      precoUnitario: formVenda.precoUnitario,
      dataVenda: formVenda.dataVenda,
      observacao: formVenda.observacao
    })

    if (res.sucesso) {
      setModalVendaAberta(false)
      exibirSucesso('Venda consignada registrada com sucesso! Comissão e saldo da loja atualizados.')
      carregarTudo()
    } else {
      alert(res.mensagem || 'Erro ao registrar venda.')
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
      dataPagamento: new Date().toISOString().slice(0, 10),
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
                            <div>
                              <span className="status-badge status-enviada">{rem.status}</span>
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
                                <th>Preço Sugerido</th>
                                <th>Comissão</th>
                                <th>Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rem.itens.map((item) => {
                                const saldoItem = calcularSaldoConsignadoItem(item)
                                return (
                                  <tr key={item.id}>
                                    <td><strong>{item.produto_nome}</strong></td>
                                    <td>{item.tamanho || 'U'}</td>
                                    <td>{item.quantidade_enviada}</td>
                                    <td>{item.quantidade_vendida}</td>
                                    <td>{item.quantidade_devolvida}</td>
                                    <td><strong>{saldoItem}</strong></td>
                                    <td>{formatarMoeda(item.preco_venda_sugerido)}</td>
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
              ABA 3: ACERTOS & FINANCEIRO
          =================================================== */}
          {abaAtiva === 'acertos' && (
            <div className="revendas-conteudo-bloco">
              <div className="bloco-header-acoes">
                <div>
                  <h2>Acertos e Pagamentos</h2>
                  <p>Controle de recebimentos periódicos, quitações parciais e totais.</p>
                </div>
                <button type="button" className="btn-acao-header primario" onClick={() => abrirModalPagamento()}>
                  + Registrar Pagamento
                </button>
              </div>

              {/* TABELA DE HISTÓRICO DE VENDAS CONSIGNADAS */}
              <div className="sub-secao-financeira">
                <h3>Vendas Registradas ({vendas.length})</h3>
                {vendas.length === 0 ? (
                  <p className="revendas-sem-dados">Nenhuma venda consignada registrada.</p>
                ) : (
                  <div className="tabela-scroll">
                    <table className="revendas-tabela">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Revendedora</th>
                          <th>Produto</th>
                          <th>Qtd</th>
                          <th>Preço Vendido</th>
                          <th>Valor Bruto</th>
                          <th>Comissão</th>
                          <th>Valor Loja</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendas.map((v) => (
                          <tr key={v.id}>
                            <td>{new Date(v.data_venda || v.criado_em).toLocaleDateString('pt-BR')}</td>
                            <td><strong>{v.revendedoras?.nome || 'Revendedora'}</strong></td>
                            <td>{v.produto_nome} {v.tamanho ? `(${v.tamanho})` : ''}</td>
                            <td><strong>{v.quantidade}</strong></td>
                            <td>{formatarMoeda(v.preco_unitario_vendido)}</td>
                            <td>{formatarMoeda(v.valor_total_bruto)}</td>
                            <td>
                              <span className="badge-comissao-sm">{v.comissao_percentual}%</span> {formatarMoeda(v.valor_comissao)}
                            </td>
                            <td><strong className="text-loja-receita">{formatarMoeda(v.valor_loja)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* HISTÓRICO DE PAGAMENTOS RECEBIDOS */}
              <div className="sub-secao-financeira" style={{ marginTop: '30px' }}>
                <h3>Pagamentos Recebidos ({pagamentos.length})</h3>
                {pagamentos.length === 0 ? (
                  <p className="revendas-sem-dados">Nenhum pagamento registrado ainda.</p>
                ) : (
                  <div className="tabela-scroll">
                    <table className="revendas-tabela">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Revendedora</th>
                          <th>Forma</th>
                          <th>Valor Pago</th>
                          <th>Observações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagamentos.map((p) => (
                          <tr key={p.id}>
                            <td>{new Date(p.data_pagamento || p.criado_em).toLocaleDateString('pt-BR')}</td>
                            <td><strong>{p.revendedoras?.nome || 'Revendedora'}</strong></td>
                            <td><span className="badge-forma-pag">{p.forma_pagamento}</span></td>
                            <td><strong className="text-sucesso-valor">{formatarMoeda(p.valor)}</strong></td>
                            <td>{p.observacao || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================
          MODAL: NOVA / EDITAR REVENDEDORA
      =================================================== */}
      {modalRevendedoraAberta && (
        <div className="revendas-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalRevendedoraAberta(false)}>
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
        <div className="revendas-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalRemessaAberta(false)}>
          <div className="revendas-modal remessa-larga">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalRemessaAberta(false)}>✕</button>
            <h2>Nova Remessa em Consignação</h2>
            <p className="modal-sub">O estoque loja será debitado e transferido para a revendedora selecionada.</p>

            <form onSubmit={handleCriarRemessa}>
              <div className="form-linha-dupla">
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
              </div>

              {/* LISTA DE ITENS DA REMESSA */}
              <div className="remessa-itens-editor">
                <div className="editor-topo">
                  <h3>Itens da Remessa</h3>
                  <button type="button" className="btn-add-item" onClick={adicionarItemRemessa}>
                    + Adicionar Produto
                  </button>
                </div>

                {formRemessa.itens.length === 0 ? (
                  <p className="nenhum-item-aviso">Nenhum produto adicionado ainda. Clique no botão acima.</p>
                ) : (
                  <div className="itens-inputs-grid">
                    {formRemessa.itens.map((item, idx) => {
                      const prodSelecionado = produtosLoja.find((p) => String(p.id) === String(item.produto_id))
                      const estoqueLojaDisponivel = prodSelecionado?.quantidade ?? 0

                      return (
                        <div key={idx} className="item-remessa-row">
                          <div className="col-prod">
                            <label>Produto</label>
                            <select
                              value={item.produto_id}
                              onChange={(e) => atualizarItemRemessa(idx, 'produto_id', e.target.value)}
                            >
                              {produtosLoja.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nome} (Disp. loja: {p.quantidade})
                                </option>
                              ))}
                            </select>
                          </div>

                          {prodSelecionado?.tamanhos?.length > 0 && (
                            <div className="col-tam">
                              <label>Tamanho</label>
                              <select
                                value={item.produto_tamanho_id}
                                onChange={(e) => atualizarItemRemessa(idx, 'produto_tamanho_id', e.target.value)}
                              >
                                {prodSelecionado.tamanhos.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.tamanho} (Disp: {t.quantidade})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="col-qtd">
                            <label>Qtd</label>
                            <input
                              type="number"
                              min="1"
                              max={estoqueLojaDisponivel}
                              value={item.quantidade}
                              onChange={(e) => atualizarItemRemessa(idx, 'quantidade', e.target.value)}
                            />
                          </div>

                          <div className="col-preco">
                            <label>Preço Sugerido (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.preco_venda_sugerido}
                              onChange={(e) => atualizarItemRemessa(idx, 'preco_venda_sugerido', e.target.value)}
                            />
                          </div>

                          <div className="col-comissao">
                            <label>Comissão (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={item.comissao_percentual}
                              onChange={(e) => atualizarItemRemessa(idx, 'comissao_percentual', e.target.value)}
                            />
                          </div>

                          <button
                            type="button"
                            className="btn-remover-item-row"
                            onClick={() => removerItemRemessa(idx)}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
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
          MODAL: REGISTRAR VENDA CONSIGNADA
      =================================================== */}
      {modalVendaAberta && itemParaVenda && (
        <div className="revendas-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalVendaAberta(false)}>
          <div className="revendas-modal">
            <button type="button" className="btn-fechar-modal" onClick={() => setModalVendaAberta(false)}>✕</button>
            <h2>Registrar Venda Consignada</h2>
            <p className="modal-sub">
              Produto: <strong>{itemParaVenda.produto_nome}</strong> ({itemParaVenda.tamanho || 'U'}) • Saldo disponível: <strong>{calcularSaldoConsignadoItem(itemParaVenda)} un.</strong>
            </p>

            <form onSubmit={handleRegistrarVenda} className="revendas-form-grid">
              <div className="form-campo">
                <label>Quantidade Vendida</label>
                <input
                  type="number"
                  min="1"
                  max={calcularSaldoConsignadoItem(itemParaVenda)}
                  required
                  value={formVenda.quantidade}
                  onChange={(e) => setFormVenda({ ...formVenda, quantidade: Number(e.target.value) })}
                />
              </div>

              <div className="form-campo">
                <label>Preço Efetivo de Venda (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formVenda.precoUnitario}
                  onChange={(e) => setFormVenda({ ...formVenda, precoUnitario: Number(e.target.value) })}
                />
              </div>

              {/* CARD DE SIMULAÇÃO DE VALORES */}
              <div className="simulacao-venda-card full">
                <div>
                  <span>Total Bruto Vendido:</span>
                  <strong>{formatarMoeda(formVenda.quantidade * formVenda.precoUnitario)}</strong>
                </div>
                <div>
                  <span>Comissão Revendedora ({itemParaVenda.comissao_percentual}%):</span>
                  <strong className="text-comissao">
                    {formatarMoeda(calcularComissao(formVenda.quantidade * formVenda.precoUnitario, itemParaVenda.comissao_percentual))}
                  </strong>
                </div>
                <div>
                  <span>Valor Devido à Loja:</span>
                  <strong className="text-loja-receita">
                    {formatarMoeda(calcularValorLoja(formVenda.quantidade * formVenda.precoUnitario, itemParaVenda.comissao_percentual))}
                  </strong>
                </div>
              </div>

              <div className="form-campo full">
                <label>Data da Venda</label>
                <input
                  type="date"
                  required
                  value={formVenda.dataVenda}
                  onChange={(e) => setFormVenda({ ...formVenda, dataVenda: e.target.value })}
                />
              </div>

              <div className="form-campo full">
                <label>Observações</label>
                <input
                  type="text"
                  value={formVenda.observacao}
                  onChange={(e) => setFormVenda({ ...formVenda, observacao: e.target.value })}
                  placeholder="Ex: Venda no cartão presencial da cliente"
                />
              </div>

              <div className="form-acoes full">
                <button type="button" className="btn-cancelar" onClick={() => setModalVendaAberta(false)}>Cancelar</button>
                <button type="submit" className="btn-salvar">Confirmar Venda</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================
          MODAL: REGISTRAR DEVOLUÇÃO CONSIGNAÇÃO
      =================================================== */}
      {modalDevolucaoAberta && itemParaDevolucao && (
        <div className="revendas-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalDevolucaoAberta(false)}>
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
        <div className="revendas-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalPagamentoAberta(false)}>
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
        <div className="revendas-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalDetalhesRevAberta(false)}>
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
    </div>
  )
}

export default Revendas

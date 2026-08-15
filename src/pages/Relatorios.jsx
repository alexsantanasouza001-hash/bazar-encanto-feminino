import { useEffect, useMemo, useState } from 'react'
import { carregarPedidos, carregarProdutos } from '../storage'
import {
  calcularMetricasRelatorio,
  filtrarPedidosPorPeriodo,
  formatarMoeda,
  gerarCsvRelatorio,
  obterIntervaloPeriodo
} from './relatoriosHelpers.js'
import { obterStatusPagamento, obterStatusPedido } from './statusHelpers.js'
import './Relatorios.css'

function Relatorios() {
  const [pedidos, setPedidos] = useState([])
  const [produtos, setProdutos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  // Filtros de período
  const [tipoPeriodo, setTipoPeriodo] = useState('30d')
  const [dataInicioCustom, setDataInicioCustom] = useState('')
  const [dataFimCustom, setDataFimCustom] = useState('')

  // Busca na tabela de pedidos
  const [buscaPedido, setBuscaPedido] = useState('')

  async function carregarDados() {
    try {
      setCarregando(true)
      setErro(null)
      const [listaPedidos, listaProdutos] = await Promise.all([
        carregarPedidos(),
        carregarProdutos(true)
      ])
      setPedidos(Array.isArray(listaPedidos) ? listaPedidos : [])
      setProdutos(Array.isArray(listaProdutos) ? listaProdutos : [])
    } catch (err) {
      console.error('Erro ao carregar dados dos relatórios:', err)
      setErro('Não foi possível carregar os dados para os relatórios.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Intervalo calculado
  const intervalo = useMemo(() => {
    return obterIntervaloPeriodo(tipoPeriodo, {
      dataInicioCustom,
      dataFimCustom
    })
  }, [tipoPeriodo, dataInicioCustom, dataFimCustom])

  // Pedidos filtrados pelo período
  const pedidosFiltrados = useMemo(() => {
    return filtrarPedidosPorPeriodo(pedidos, {
      dataInicio: intervalo.dataInicio,
      dataFim: intervalo.dataFim
    })
  }, [pedidos, intervalo])

  // Métricas calculadas
  const metricas = useMemo(() => {
    return calcularMetricasRelatorio(pedidosFiltrados, produtos)
  }, [pedidosFiltrados, produtos])

  // Pedidos para a tabela com busca
  const pedidosTabela = useMemo(() => {
    if (!buscaPedido.trim()) return pedidosFiltrados
    const termo = buscaPedido.toLowerCase().trim()
    return pedidosFiltrados.filter((p) => {
      const num = String(p.numero || '').toLowerCase()
      const cli = String(p.cliente || p.nomeCliente || '').toLowerCase()
      const email = String(p.email_cliente || p.email || '').toLowerCase()
      return num.includes(termo) || cli.includes(termo) || email.includes(termo)
    })
  }, [pedidosFiltrados, buscaPedido])

  // Exportar CSV
  const handleExportarCsv = () => {
    const csvContent = gerarCsvRelatorio({
      metricas,
      pedidosFiltrados,
      periodoRotulo: intervalo.rotulo
    })
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `relatorio-bazar-${tipoPeriodo}-${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Maior faturamento diário para escala do gráfico SVG
  const maxFaturamentoDiario = useMemo(() => {
    if (!metricas.evolucaoDiaria || metricas.evolucaoDiaria.length === 0) return 100
    const max = Math.max(...metricas.evolucaoDiaria.map((d) => d.faturamento))
    return max > 0 ? max : 100
  }, [metricas.evolucaoDiaria])

  return (
    <div className="relatorios-page">
      {/* ===================================================
          CABEÇALHO & CONTROLES DE PERÍODO
      =================================================== */}
      <header className="relatorios-header">
        <div>
          <span className="relatorios-eyebrow">BAZAR ENCANTO FEMININO</span>
          <h1>Relatórios & Métricas</h1>
          <p>Visão estratégica e detalhada de vendas, produtos, clientes e estoque.</p>
        </div>

        <div className="relatorios-acoes-header">
          <button
            type="button"
            className="btn-exportar-csv"
            onClick={handleExportarCsv}
            disabled={carregando || pedidosFiltrados.length === 0}
          >
            <span>⬇</span> Exportar CSV
          </button>
        </div>
      </header>

      {/* BARRA DE FILTRO DE PERÍODO */}
      <section className="relatorios-periodo-bar">
        <div className="periodo-botoes-wrap">
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: '7d', label: '7 dias' },
            { id: '30d', label: '30 dias' },
            { id: 'mes-atual', label: 'Mês atual' },
            { id: 'mes-anterior', label: 'Mês anterior' },
            { id: 'ano-atual', label: 'Ano atual' },
            { id: 'personalizado', label: 'Personalizado' }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn-periodo ${tipoPeriodo === item.id ? 'active' : ''}`}
              onClick={() => setTipoPeriodo(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tipoPeriodo === 'personalizado' && (
          <div className="periodo-custom-inputs">
            <label>
              De:
              <input
                type="date"
                value={dataInicioCustom}
                onChange={(e) => setDataInicioCustom(e.target.value)}
              />
            </label>
            <label>
              Até:
              <input
                type="date"
                value={dataFimCustom}
                onChange={(e) => setDataFimCustom(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="periodo-rotulo-atual">
          <span>Período:</span> <strong>{intervalo.rotulo}</strong>
        </div>
      </section>

      {/* ESTADOS DE CARREGAMENTO / ERRO */}
      {carregando && (
        <div className="relatorios-feedback-state">
          <span>✿</span>
          <strong>Carregando relatórios...</strong>
        </div>
      )}

      {erro && !carregando && (
        <div className="relatorios-feedback-state error">
          <p>{erro}</p>
          <button type="button" className="btn-tentar-novamente" onClick={carregarDados}>
            Tentar novamente
          </button>
        </div>
      )}

      {!carregando && !erro && (
        <>
          {/* ===================================================
              CARDS PRINCIPAIS DE KPI
          =================================================== */}
          <section className="relatorios-kpis-grid">
            <div className="kpi-card destaque">
              <span className="kpi-label">Faturamento Bruto</span>
              <strong className="kpi-valor">{formatarMoeda(metricas.faturamentoBruto)}</strong>
              <small className="kpi-sub">
                Líquido (s/ frete): {formatarMoeda(metricas.faturamentoLiquido)}
              </small>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Total de Pedidos</span>
              <strong className="kpi-valor">{metricas.totalPedidos}</strong>
              <small className="kpi-sub text-success">
                {metricas.pedidosPagos} pagos / {metricas.pedidosCancelados} cancelados
              </small>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Ticket Médio</span>
              <strong className="kpi-valor">{formatarMoeda(metricas.ticketMedio)}</strong>
              <small className="kpi-sub">Por pedido pago</small>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Itens Vendidos</span>
              <strong className="kpi-valor">{metricas.totalItensVendidos} un.</strong>
              <small className="kpi-sub">Peças comercializadas</small>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Clientes Atendidos</span>
              <strong className="kpi-valor">{metricas.totalClientesUnicos}</strong>
              <small className="kpi-sub">
                {metricas.clientesNovos} novos / {metricas.clientesRecorrentes} recorrentes
              </small>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Descontos & Frete</span>
              <strong className="kpi-valor">{formatarMoeda(metricas.totalDescontos)}</strong>
              <small className="kpi-sub">Frete total: {formatarMoeda(metricas.totalFrete)}</small>
            </div>
          </section>

          {/* ===================================================
              SEÇÃO: EVOLUÇÃO TEMPORAL DE VENDAS (GRÁFICO)
          =================================================== */}
          <section className="relatorios-secao-box">
            <div className="secao-box-header">
              <div>
                <span>DESEMPENHO DIÁRIO</span>
                <h2>Evolução de Vendas</h2>
              </div>
              <small>{metricas.evolucaoDiaria.length} dia(s) com vendas no período</small>
            </div>

            {metricas.evolucaoDiaria.length === 0 ? (
              <div className="relatorios-sem-dados">
                <p>Nenhuma venda registrada no período selecionado.</p>
              </div>
            ) : (
              <div className="grafico-barras-container">
                <div className="grafico-barras">
                  {metricas.evolucaoDiaria.map((dia) => {
                    const alturaPercent = Math.max(
                      8,
                      Math.round((dia.faturamento / maxFaturamentoDiario) * 100)
                    )
                    const dataFormatada = dia.data.slice(8, 10) + '/' + dia.data.slice(5, 7)

                    return (
                      <div key={dia.data} className="barra-coluna" title={`${dia.data}: ${formatarMoeda(dia.faturamento)} (${dia.pedidos} pedido(s))`}>
                        <div className="barra-rotulo-topo">{formatarMoeda(dia.faturamento)}</div>
                        <div className="barra-track">
                          <div className="barra-fill" style={{ height: `${alturaPercent}%` }} />
                        </div>
                        <span className="barra-rotulo-base">{dataFormatada}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ===================================================
              SEÇÃO DUPLA: FORMAS DE PAGAMENTO & ESTOQUE
          =================================================== */}
          <div className="relatorios-dupla-grid">
            {/* FORMAS DE PAGAMENTO */}
            <section className="relatorios-secao-box">
              <div className="secao-box-header">
                <div>
                  <span>PAGAMENTOS</span>
                  <h2>Formas de Pagamento</h2>
                </div>
              </div>

              {metricas.formasPagamento.length === 0 ? (
                <p className="relatorios-sem-dados">Nenhum pagamento registrado no período.</p>
              ) : (
                <div className="formas-pagamento-lista">
                  {metricas.formasPagamento.map((forma) => (
                    <div key={forma.forma} className="forma-item">
                      <div className="forma-info">
                        <strong>{forma.forma}</strong>
                        <span>
                          {forma.pedidosAprovados} pedido(s) • {formatarMoeda(forma.faturamento)}
                        </span>
                      </div>
                      <div className="forma-barra-wrap">
                        <div
                          className="forma-barra-fill"
                          style={{ width: `${Math.round(forma.percentualFaturamento)}%` }}
                        />
                      </div>
                      <span className="forma-percentual">
                        {forma.percentualFaturamento.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PANORAMA DE ESTOQUE */}
            <section className="relatorios-secao-box">
              <div className="secao-box-header">
                <div>
                  <span>PANORAMA ATUAL</span>
                  <h2>Estoque da Loja</h2>
                </div>
              </div>

              <div className="estoque-resumo-grid">
                <div className="estoque-mini-card">
                  <span>Peças no total</span>
                  <strong>{metricas.estoque.totalPecasEstoque} un.</strong>
                </div>
                <div className="estoque-mini-card alerta">
                  <span>Estoque baixo (≤ 3)</span>
                  <strong>{metricas.estoque.produtosEstoqueBaixo} produtos</strong>
                </div>
                <div className="estoque-mini-card perigo">
                  <span>Esgotados</span>
                  <strong>{metricas.estoque.produtosSemEstoque} produtos</strong>
                </div>
                <div className="estoque-mini-card">
                  <span>Valor estimado venda</span>
                  <strong>{formatarMoeda(metricas.estoque.valorTotalVenda)}</strong>
                </div>
              </div>

              {metricas.estoque.valorTotalCusto > 0 && (
                <p className="estoque-custo-nota">
                  Valor estimado a preço de custo: <strong>{formatarMoeda(metricas.estoque.valorTotalCusto)}</strong>
                </p>
              )}
            </section>
          </div>

          {/* ===================================================
              SEÇÃO: PRODUTOS & CATEGORIAS MAIS VENDIDOS
          =================================================== */}
          <div className="relatorios-dupla-grid">
            {/* PRODUTOS MAIS VENDIDOS */}
            <section className="relatorios-secao-box">
              <div className="secao-box-header">
                <div>
                  <span>TOP PRODUTOS</span>
                  <h2>Mais Vendidos</h2>
                </div>
              </div>

              {metricas.produtosMaisVendidos.length === 0 ? (
                <p className="relatorios-sem-dados">Nenhum item vendido no período.</p>
              ) : (
                <div className="relatorios-tabela-scroll">
                  <table className="relatorios-tabela">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Qtd</th>
                        <th>Faturamento</th>
                        <th>Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricas.produtosMaisVendidos.slice(0, 8).map((prod) => (
                        <tr key={prod.id || prod.nome}>
                          <td>
                            <strong>{prod.nome}</strong>
                            <small className="tabela-cat-sub">{prod.categoria}</small>
                          </td>
                          <td><strong>{prod.quantidadeVendida}</strong></td>
                          <td>{formatarMoeda(prod.faturamento)}</td>
                          <td>{prod.estoqueAtual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* CATEGORIAS & TAMANHOS */}
            <section className="relatorios-secao-box">
              <div className="secao-box-header">
                <div>
                  <span>CATEGORIAS & GRADE</span>
                  <h2>Distribuição</h2>
                </div>
              </div>

              <div className="distribuicao-bloco">
                <h3>Categorias</h3>
                {metricas.categoriasMaisVendidas.length === 0 ? (
                  <p className="relatorios-sem-dados">Sem dados.</p>
                ) : (
                  <div className="categorias-tags-lista">
                    {metricas.categoriasMaisVendidas.map((cat) => (
                      <div key={cat.categoria} className="cat-tag-item">
                        <span>{cat.categoria}</span>
                        <strong>{cat.quantidadeVendida} un. ({formatarMoeda(cat.faturamento)})</strong>
                      </div>
                    ))}
                  </div>
                )}

                <h3 style={{ marginTop: '20px' }}>Tamanhos mais vendidos</h3>
                {metricas.tamanhosMaisVendidos.length === 0 ? (
                  <p className="relatorios-sem-dados">Sem dados.</p>
                ) : (
                  <div className="tamanhos-badges-lista">
                    {metricas.tamanhosMaisVendidos.map((tam) => (
                      <div key={tam.tamanho} className="tam-badge-item">
                        <span>{tam.tamanho}</span>
                        <strong>{tam.quantidadeVendida} un.</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ===================================================
              SEÇÃO: TABELA DETALHADA DE VENDAS DO PERÍODO
          =================================================== */}
          <section className="relatorios-secao-box">
            <div className="secao-box-header">
              <div>
                <span>DETALHAMENTO</span>
                <h2>Pedidos do Período</h2>
              </div>
              <div className="busca-pedido-wrap">
                <input
                  type="text"
                  placeholder="Buscar por nº, cliente ou e-mail..."
                  value={buscaPedido}
                  onChange={(e) => setBuscaPedido(e.target.value)}
                  className="busca-pedido-input"
                  aria-label="Buscar pedidos no relatório"
                />
              </div>
            </div>

            {pedidosTabela.length === 0 ? (
              <p className="relatorios-sem-dados">Nenhum pedido encontrado para a busca/período.</p>
            ) : (
              <div className="relatorios-tabela-scroll">
                <table className="relatorios-tabela">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th>Forma</th>
                      <th>Status Pedido</th>
                      <th>Pagamento</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosTabela.map((ped) => {
                      const statusPed = obterStatusPedido(ped.status)
                      const statusPag = obterStatusPagamento(ped.status_pagamento)
                      const dataFormatada = ped.data
                        ? new Date(ped.data).toLocaleDateString('pt-BR')
                        : '--'

                      return (
                        <tr key={ped.id || ped.numero}>
                          <td><strong>{ped.numero}</strong></td>
                          <td>{dataFormatada}</td>
                          <td>
                            <strong>{ped.cliente || ped.nomeCliente || 'Cliente'}</strong>
                            <small className="tabela-cat-sub">{ped.email_cliente || ped.email || ''}</small>
                          </td>
                          <td>{ped.forma_pagamento || '--'}</td>
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
                          <td><strong>{formatarMoeda(ped.total || ped.valorTotal)}</strong></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default Relatorios

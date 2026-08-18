import { useEffect, useState } from 'react'
import {
  carregarPagamentosRevendas,
  carregarPedidos,
  carregarProdutos,
  carregarRemessas,
  carregarRevendedoras,
  carregarVendasRevendas
} from '../storage'
import { consolidarResumoRevendedora } from './revendasHelpers'
import { obterStatusPagamento, obterStatusPedido } from './statusHelpers'

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

function extrairTotalEstoque(produto) {
  if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
    return produto.tamanhos.reduce(
      (total, item) => total + Number(item.quantidade || 0),
      0
    )
  }
  return Number(produto.quantidade ?? produto.estoque ?? 0)
}

function extrairItensPedido(pedido) {
  const itens = pedido.itens || pedido.produtos || pedido.carrinho || []
  if (Array.isArray(itens) && itens.length > 0) {
    return itens
      .map((item) => `${item.nome || item.produtoNome || 'Produto'}${item.quantidade > 1 ? ` (${item.quantidade}x)` : ''}`)
      .join(', ')
  }
  return 'Itens não informados'
}

function calcularUltimosMeses(pedidos) {
  const agora = new Date()
  const mesesAbreviados = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const resultado = []

  for (let i = 5; i >= 0; i--) {
    const dataRef = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const mesIndex = dataRef.getMonth()
    const ano = dataRef.getFullYear()
    const label = mesesAbreviados[mesIndex]

    const totalMes = pedidos.reduce((soma, pedido) => {
      const dataPedido = new Date(pedido.data || pedido.dataPedido || pedido.createdAt || '')
      if (
        !Number.isNaN(dataPedido.getTime()) &&
        dataPedido.getMonth() === mesIndex &&
        dataPedido.getFullYear() === ano &&
        pedido.status !== 'Cancelado'
      ) {
        return soma + Number(pedido.total || pedido.valorTotal || 0)
      }
      return soma
    }, 0)

    resultado.push({ label, mesIndex, ano, total: totalMes })
  }

  const maxTotal = Math.max(...resultado.map((m) => m.total), 1)
  return resultado.map((m) => ({
    ...m,
    percentual: m.total > 0 ? Math.max(12, Math.round((m.total / maxTotal) * 100)) : 6
  }))
}

function Dashboard({ setPagina, papelUsuario = 'admin' }) {
  const [pedidos, setPedidos] = useState([])
  const [produtos, setProdutos] = useState([])
  const [revendedoras, setRevendedoras] = useState([])
  const [remessas, setRemessas] = useState([])
  const [vendasRevendas, setVendasRevendas] = useState([])
  const [pagamentosRevendas, setPagamentosRevendas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const navegarPara = (pagina) => {
    if (typeof setPagina === 'function') {
      setPagina(pagina)
    }
  }

  async function carregarDados() {
    try {
      setCarregando(true)
      setErro(null)

      const [
        pedidosCarregados,
        produtosCarregados,
        revs,
        rems,
        vends,
        pags
      ] = await Promise.all([
        carregarPedidos(),
        carregarProdutos(true),
        carregarRevendedoras(),
        carregarRemessas(),
        carregarVendasRevendas(),
        carregarPagamentosRevendas()
      ])

      setPedidos(Array.isArray(pedidosCarregados) ? pedidosCarregados : [])
      setProdutos(Array.isArray(produtosCarregados) ? produtosCarregados : [])
      setRevendedoras(Array.isArray(revs) ? revs : [])
      setRemessas(Array.isArray(rems) ? rems : [])
      setVendasRevendas(Array.isArray(vends) ? vends : [])
      setPagamentosRevendas(Array.isArray(pags) ? pags : [])
    } catch (err) {
      console.error('Erro ao carregar dados do Dashboard:', err)
      setErro('Não foi possível carregar as métricas do painel.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Métricas de Produtos e Estoque
  const totalProdutos = produtos.length
  const produtosAtivos = produtos.filter((p) => p.ativo !== false).length
  const totalPecasEstoque = produtos.reduce((soma, p) => soma + extrairTotalEstoque(p), 0)
  const produtosPoucoEstoque = produtos.filter((p) => {
    const estoque = extrairTotalEstoque(p)
    return estoque > 0 && estoque <= 3
  }).length

  // Categorias de estoque
  const categoriasPrincipais = ['Vestidos', 'Blusas', 'Calças', 'Shorts']
  const estoquePorCategoria = categoriasPrincipais.map((cat) => {
    const totalCat = produtos
      .filter((p) => (p.categoria || '').toLowerCase() === cat.toLowerCase())
      .reduce((soma, p) => soma + extrairTotalEstoque(p), 0)
    return { categoria: cat, total: totalCat }
  })

  // Métricas de Pedidos e Vendas
  const hoje = new Date()
  const mesAtual = hoje.getMonth()
  const anoAtual = hoje.getFullYear()

  const pedidosMes = pedidos.filter((pedido) => {
    const data = new Date(pedido.data || pedido.dataPedido || pedido.createdAt || '')
    return (
      !Number.isNaN(data.getTime()) &&
      data.getMonth() === mesAtual &&
      data.getFullYear() === anoAtual
    )
  })

  const vendasMesTotal = pedidosMes.reduce((soma, pedido) => {
    if (pedido.status === 'Cancelado') return soma
    return soma + Number(pedido.total || pedido.valorTotal || 0)
  }, 0)

  const totalVendidoGeral = pedidos.reduce((soma, pedido) => {
    if (pedido.status === 'Cancelado') return soma
    return soma + Number(pedido.total || pedido.valorTotal || 0)
  }, 0)

  const pedidosConfirmados = pedidos.filter(
    (p) => obterStatusPedido(p.status) === 'Confirmado' || p.status_pagamento === 'aprovado'
  ).length

  // Últimas vendas ordenadas por data
  const ultimasVendas = [...pedidos]
    .sort((a, b) => {
      const dataA = new Date(a.data || a.dataPedido || a.createdAt || 0).getTime()
      const dataB = new Date(b.data || b.dataPedido || b.createdAt || 0).getTime()
      return dataB - dataA
    })
    .slice(0, 5)

  // Gráfico de 6 meses
  const dadosGrafico = calcularUltimosMeses(pedidos)

  // Resumo de Revendas / Consignação
  const resumosRev = revendedoras.map((r) => consolidarResumoRevendedora(r, remessas, vendasRevendas, pagamentosRevendas))
  const revendedorasAtivasCount = revendedoras.filter((r) => r.status === 'Ativa').length
  const pecasConsignadasTotal = resumosRev.reduce((acc, r) => acc + (r?.pecasConsignadas || 0), 0)
  const valorConsignadoTotal = resumosRev.reduce((acc, r) => acc + (r?.valorConsignado || 0), 0)
  const saldoReceberRevendasTotal = resumosRev.reduce((acc, r) => acc + (r?.saldoPendente || 0), 0)
  const acertosAtrasadosCount = resumosRev.filter((r) => r?.atrasado).length

  if (carregando) {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">VISÃO GERAL</span>
            <h1>Painel Administrativo ✨</h1>
            <p>Carregando métricas reais da loja...</p>
          </div>
        </header>
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6A584C' }}>
          <strong>Carregando dados do painel...</strong>
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">VISÃO GERAL</span>
            <h1>Painel Administrativo ✨</h1>
            <p style={{ color: '#A03030' }}>{erro}</p>
          </div>
        </header>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <button
            type="button"
            className="period-button"
            onClick={carregarDados}
            style={{ cursor: 'pointer', padding: '10px 20px' }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      {/* ==========================================
          CABEÇALHO
      ========================================== */}
      <header className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">VISÃO GERAL</span>
          <h1>Olá, Administrador ✨</h1>
          <p>Acompanhe o desempenho do seu Bazar Encanto Feminino com dados em tempo real.</p>
        </div>

        <div className="dashboard-user-area">
          <button
            type="button"
            className="notification-button"
            title={`${pedidosMes.length} pedidos este mês`}
          >
            ♧
            {pedidosMes.length > 0 && <span className="notification-dot"></span>}
          </button>

          <div className="dashboard-user">
            <div className="dashboard-avatar">A</div>
            <div className="dashboard-user-info">
              <strong>Administrador</strong>
              <span>Painel administrativo</span>
            </div>
          </div>
        </div>
      </header>

      {/* ==========================================
          CARDS COM DADOS REAIS
      ========================================== */}
      <section className="dashboard-cards">
        {/* VENDAS DO MÊS */}
        <div className="dashboard-card" style={{ cursor: 'pointer' }} onClick={() => navegarPara('pedidos')}>
          <div className="dashboard-card-top">
            <div className="dashboard-card-icon purple">R$</div>
            <span className="dashboard-card-label">Vendas do mês</span>
          </div>
          <div className="dashboard-card-value">
            {formatarPreco(vendasMesTotal)}
          </div>
          <div className="dashboard-card-footer positive">
            {pedidosMes.length} {pedidosMes.length === 1 ? 'pedido este mês' : 'pedidos este mês'}
          </div>
        </div>

        {/* PRODUTOS CADASTRADOS */}
        <div className="dashboard-card" style={{ cursor: 'pointer' }} onClick={() => navegarPara('produtos')}>
          <div className="dashboard-card-top">
            <div className="dashboard-card-icon green">♢</div>
            <span className="dashboard-card-label">Produtos</span>
          </div>
          <div className="dashboard-card-value">{totalProdutos}</div>
          <div className="dashboard-card-footer">
            {produtosAtivos} ativos no catálogo
          </div>
        </div>

        {/* ESTOQUE TOTAL */}
        <div className="dashboard-card" style={{ cursor: 'pointer' }} onClick={() => navegarPara('estoque')}>
          <div className="dashboard-card-top">
            <div className="dashboard-card-icon rose">▣</div>
            <span className="dashboard-card-label">Peças em Estoque</span>
          </div>
          <div className="dashboard-card-value">{totalPecasEstoque}</div>
          <div className="dashboard-card-footer">
            {produtosPoucoEstoque > 0
              ? `${produtosPoucoEstoque} com estoque baixo`
              : 'Estoque regular'}
          </div>
        </div>

        {/* TOTAL DE PEDIDOS */}
        <div className="dashboard-card" style={{ cursor: 'pointer' }} onClick={() => navegarPara('pedidos')}>
          <div className="dashboard-card-top">
            <div className="dashboard-card-icon gold">◇</div>
            <span className="dashboard-card-label">Total de Pedidos</span>
          </div>
          <div className="dashboard-card-value">{pedidos.length}</div>
          <div className="dashboard-card-footer">
            {pedidosConfirmados} confirmados / pagos
          </div>
        </div>
      </section>

      {/* ==========================================
          REVENDA / CONSIGNAÇÃO
      ========================================== */}
      {papelUsuario !== 'operador' && (
        <section className="dashboard-panel" style={{ marginTop: '24px', marginBottom: '24px' }}>
          <div className="dashboard-panel-header">
            <div>
              <h2>Revenda / Consignação 🤝</h2>
              <p>Acompanhamento de estoque consignado e acertos com parceiras</p>
            </div>
            <button
              type="button"
              className="panel-link"
              onClick={() => navegarPara('revendas')}
            >
              Ver revendas →
            </button>
          </div>

          <div className="dashboard-cards" style={{ marginTop: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="dashboard-card" style={{ padding: '14px', cursor: 'pointer' }} onClick={() => navegarPara('revendas')}>
              <div className="dashboard-card-top">
                <div className="dashboard-card-icon green">🤝</div>
                <span className="dashboard-card-label">Parceiras Ativas</span>
              </div>
              <div className="dashboard-card-value" style={{ fontSize: '20px' }}>{revendedorasAtivasCount}</div>
              <div className="dashboard-card-footer">{revendedoras.length} cadastradas</div>
            </div>

            <div className="dashboard-card" style={{ padding: '14px', cursor: 'pointer' }} onClick={() => navegarPara('revendas')}>
              <div className="dashboard-card-top">
                <div className="dashboard-card-icon purple">▣</div>
                <span className="dashboard-card-label">Em Consignação</span>
              </div>
              <div className="dashboard-card-value" style={{ fontSize: '20px' }}>{pecasConsignadasTotal} un.</div>
              <div className="dashboard-card-footer">{formatarPreco(valorConsignadoTotal)} em mercadoria</div>
            </div>

            <div className="dashboard-card" style={{ padding: '14px', cursor: 'pointer' }} onClick={() => navegarPara('revendas')}>
              <div className="dashboard-card-top">
                <div className="dashboard-card-icon gold">R$</div>
                <span className="dashboard-card-label">Vendido a Receber</span>
              </div>
              <div className="dashboard-card-value" style={{ fontSize: '20px', color: '#b45309' }}>{formatarPreco(saldoReceberRevendasTotal)}</div>
              <div className="dashboard-card-footer">
                {acertosAtrasadosCount > 0 ? `⚠ ${acertosAtrasadosCount} acerto(s) atrasado(s)` : 'Acertos em dia'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==========================================
          GRÁFICOS / ESTOQUE
      ========================================== */}
      <section className="dashboard-grid">
        {/* PAINEL DE VENDAS */}
        <div className="dashboard-panel sales-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2>Vendas</h2>
              <p>Desempenho dos últimos 6 meses</p>
            </div>
            <button
              type="button"
              className="period-button"
              onClick={() => navegarPara('pedidos')}
            >
              Ver pedidos ▾
            </button>
          </div>

          <div className="sales-summary">
            <div>
              <span>Total faturado geral</span>
              <strong>{formatarPreco(totalVendidoGeral)}</strong>
            </div>
          </div>

          <div className="sales-chart">
            <div className="chart-grid-line line-one"></div>
            <div className="chart-grid-line line-two"></div>
            <div className="chart-grid-line line-three"></div>

            <div className="bars">
              {dadosGrafico.map((mes, idx) => (
                <div className="bar-container" key={`${mes.label}-${mes.ano}`}>
                  <div
                    className={`bar bar-${idx + 1}`}
                    style={{ height: `${mes.percentual}%` }}
                    title={`${mes.label}/${mes.ano}: ${formatarPreco(mes.total)}`}
                  ></div>
                  <span>{mes.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PAINEL DE ESTOQUE */}
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <h2>Estoque</h2>
              <p>Situação por categoria</p>
            </div>
            <button
              type="button"
              className="panel-link"
              onClick={() => navegarPara('estoque')}
            >
              Ver estoque →
            </button>
          </div>

          <div className="stock-list">
            {estoquePorCategoria.map((item) => (
              <div className="stock-item" key={item.categoria}>
                <div className="stock-item-info">
                  <span className="stock-icon">✿</span>
                  <span>{item.categoria}</span>
                </div>
                <strong>{item.total}</strong>
              </div>
            ))}

            {produtosPoucoEstoque > 0 && (
              <div className="stock-item low-stock">
                <div className="stock-item-info">
                  <span className="stock-warning">!</span>
                  <span>Pouco estoque (≤ 3 un.)</span>
                </div>
                <strong>{produtosPoucoEstoque}</strong>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==========================================
          ÚLTIMAS VENDAS REAIS
      ========================================== */}
      <section className="dashboard-panel recent-sales-panel">
        <div className="dashboard-panel-header">
          <div>
            <h2>Últimas vendas</h2>
            <p>Vendas recentes registradas na loja</p>
          </div>
          <button
            type="button"
            className="panel-link"
            onClick={() => navegarPara('pedidos')}
          >
            Ver todas →
          </button>
        </div>

        <div className="dashboard-table-wrapper">
          {ultimasVendas.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#6A584C' }}>
              Nenhum pedido realizado até o momento.
            </div>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Produto(s)</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ultimasVendas.map((pedido, idx) => {
                  const statusPag = obterStatusPagamento(pedido.status_pagamento)
                  const statusPed = obterStatusPedido(pedido.status)
                  const statusClass = statusPag.aprovado
                    ? 'paid'
                    : pedido.status === 'Cancelado'
                      ? 'cancelled'
                      : 'pending'

                  return (
                    <tr key={pedido.id || pedido.numero || idx}>
                      <td>
                        <strong>{pedido.cliente || pedido.nomeCliente || 'Cliente'}</strong>
                      </td>
                      <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {extrairItensPedido(pedido)}
                      </td>
                      <td>{formatarData(pedido.data || pedido.dataPedido || pedido.createdAt)}</td>
                      <td>
                        <strong>{formatarPreco(pedido.total || pedido.valorTotal)}</strong>
                      </td>
                      <td>
                        <span className={`status ${statusClass}`}>
                          {statusPag.aprovado ? 'Pago' : statusPed}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

export default Dashboard
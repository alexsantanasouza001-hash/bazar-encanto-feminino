import { agruparClientesDosPedidos, ePedidoPagoValido } from './clientesHelpers.js'

export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

export function obterIntervaloPeriodo(
  tipo = '30d',
  { dataInicioCustom, dataFimCustom, referenciaAgora = new Date() } = {}
) {
  const agora = new Date(referenciaAgora)
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999)
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0)

  switch (tipo) {
    case 'hoje':
      return { dataInicio: inicioHoje, dataFim: fimHoje, rotulo: 'Hoje' }

    case '7d': {
      const inicio7d = new Date(inicioHoje)
      inicio7d.setDate(inicio7d.getDate() - 6)
      return { dataInicio: inicio7d, dataFim: fimHoje, rotulo: 'Últimos 7 dias' }
    }

    case '30d': {
      const inicio30d = new Date(inicioHoje)
      inicio30d.setDate(inicio30d.getDate() - 29)
      return { dataInicio: inicio30d, dataFim: fimHoje, rotulo: 'Últimos 30 dias' }
    }

    case 'mes-atual': {
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0)
      return { dataInicio: inicioMes, dataFim: fimHoje, rotulo: 'Mês atual' }
    }

    case 'mes-anterior': {
      const inicioMesAnt = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0, 0)
      const fimMesAnt = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999)
      return { dataInicio: inicioMesAnt, dataFim: fimMesAnt, rotulo: 'Mês anterior' }
    }

    case 'ano-atual': {
      const inicioAno = new Date(agora.getFullYear(), 0, 1, 0, 0, 0, 0)
      return { dataInicio: inicioAno, dataFim: fimHoje, rotulo: 'Ano atual' }
    }

    case 'personalizado': {
      if (!dataInicioCustom) {
        return { dataInicio: inicioHoje, dataFim: fimHoje, rotulo: 'Personalizado' }
      }
      const [anoI, mesI, diaI] = dataInicioCustom.split('-').map(Number)
      const dataI = new Date(anoI, mesI - 1, diaI, 0, 0, 0, 0)

      let dataF = fimHoje
      if (dataFimCustom) {
        const [anoF, mesF, diaF] = dataFimCustom.split('-').map(Number)
        dataF = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999)
      }
      return {
        dataInicio: dataI,
        dataFim: dataF,
        rotulo: `Personalizado (${dataInicioCustom} a ${dataFimCustom || dataInicioCustom})`
      }
    }

    default: {
      const fallback30d = new Date(inicioHoje)
      fallback30d.setDate(fallback30d.getDate() - 29)
      return { dataInicio: fallback30d, dataFim: fimHoje, rotulo: 'Últimos 30 dias' }
    }
  }
}

export function filtrarPedidosPorPeriodo(pedidos = [], { dataInicio, dataFim }) {
  if (!Array.isArray(pedidos)) return []
  if (!dataInicio && !dataFim) return [...pedidos]

  const timeInicio = dataInicio ? new Date(dataInicio).getTime() : 0
  const timeFim = dataFim ? new Date(dataFim).getTime() : Number.POSITIVE_INFINITY

  return pedidos.filter((pedido) => {
    const rawData = pedido.data || pedido.dataPedido || pedido.createdAt
    if (!rawData) return false
    const timePedido = new Date(rawData).getTime()
    if (Number.isNaN(timePedido)) return false
    return timePedido >= timeInicio && timePedido <= timeFim
  })
}

export function normalizarFormaPagamento(forma) {
  const str = String(forma || '').trim().toLowerCase()
  if (str.includes('pix')) return 'Pix'
  if (str.includes('cart') || str.includes('crédito') || str.includes('credito')) {
    return 'Cartão de crédito'
  }
  return forma ? String(forma).trim() : 'Outros'
}

export function calcularMetricasRelatorio(pedidosFiltrados = [], produtos = []) {
  const listaPedidos = Array.isArray(pedidosFiltrados) ? pedidosFiltrados : []
  const listaProdutos = Array.isArray(produtos) ? produtos : []

  const produtosMap = new Map()
  for (const prod of listaProdutos) {
    produtosMap.set(Number(prod.id), prod)
  }

  let totalPedidos = 0
  let pedidosPagosCount = 0
  let pedidosCanceladosCount = 0
  let faturamentoBruto = 0
  let totalDescontos = 0
  let totalFrete = 0
  let totalItensVendidos = 0

  const pedidosPagosLista = []
  const diasMap = new Map()
  const produtosVendidosMap = new Map()
  const categoriasMap = new Map()
  const tamanhosMap = new Map()
  const formasPagamentoMap = new Map()

  for (const pedido of listaPedidos) {
    totalPedidos += 1
    const cancelado = pedido.status === 'Cancelado' || pedido.status_pagamento === 'recusado'
    if (cancelado) {
      pedidosCanceladosCount += 1
    }

    const pago = ePedidoPagoValido(pedido)
    const valorTotal = Number(pedido.total || pedido.valorTotal || 0)
    const valorDesconto = Number(pedido.desconto || 0)
    const valorFreteItem = Number(pedido.valor_frete || 0)
    const forma = normalizarFormaPagamento(pedido.forma_pagamento)

    // Agrupa formas de pagamento (incluindo totais e aprovados)
    if (!formasPagamentoMap.has(forma)) {
      formasPagamentoMap.set(forma, {
        forma,
        totalPedidos: 0,
        pedidosAprovados: 0,
        faturamento: 0
      })
    }
    const formaObj = formasPagamentoMap.get(forma)
    formaObj.totalPedidos += 1

    if (pago) {
      pedidosPagosCount += 1
      faturamentoBruto += valorTotal
      totalDescontos += valorDesconto
      totalFrete += valorFreteItem
      formaObj.pedidosAprovados += 1
      formaObj.faturamento += valorTotal
      pedidosPagosLista.push(pedido)

      // Evolução diária
      const rawData = pedido.data || pedido.dataPedido || pedido.createdAt || ''
      const diaKey = rawData ? rawData.slice(0, 10) : 'Sem data'

      if (!diasMap.has(diaKey)) {
        diasMap.set(diaKey, {
          data: diaKey,
          faturamento: 0,
          pedidos: 0,
          itens: 0
        })
      }
      const diaObj = diasMap.get(diaKey)
      diaObj.faturamento += valorTotal
      diaObj.pedidos += 1

      // Itens vendidos
      const itens = Array.isArray(pedido.itens) ? pedido.itens : []
      for (const item of itens) {
        const qtd = Number(item.quantidade || 1)
        const subtotal = Number(item.subtotal || item.preco * qtd || 0)
        const produtoId = Number(item.produtoId ?? item.produto_id ?? 0)
        const nome = item.nome || 'Produto sem nome'
        const categoria = item.categoria || 'Geral'
        const tamanho = item.tamanho || 'U'

        totalItensVendidos += qtd
        diaObj.itens += qtd

        // Agrupa por produto
        const prodKey = produtoId > 0 ? `id:${produtoId}` : `nome:${nome}`
        if (!produtosVendidosMap.has(prodKey)) {
          const produtoCadastrado = produtosMap.get(produtoId)
          produtosVendidosMap.set(prodKey, {
            id: produtoId,
            nome,
            categoria,
            quantidadeVendida: 0,
            faturamento: 0,
            estoqueAtual: produtoCadastrado ? Number(produtoCadastrado.quantidade || 0) : '--',
            precoMedio: Number(item.preco || 0)
          })
        }
        const pObj = produtosVendidosMap.get(prodKey)
        pObj.quantidadeVendida += qtd
        pObj.faturamento += subtotal

        // Agrupa por categoria
        if (!categoriasMap.has(categoria)) {
          categoriasMap.set(categoria, {
            categoria,
            quantidadeVendida: 0,
            faturamento: 0
          })
        }
        const catObj = categoriasMap.get(categoria)
        catObj.quantidadeVendida += qtd
        catObj.faturamento += subtotal

        // Agrupa por tamanho
        if (!tamanhosMap.has(tamanho)) {
          tamanhosMap.set(tamanho, {
            tamanho,
            quantidadeVendida: 0
          })
        }
        const tamObj = tamanhosMap.get(tamanho)
        tamObj.quantidadeVendida += qtd
      }
    }
  }

  const faturamentoLiquido = Math.max(0, faturamentoBruto - totalFrete)
  const ticketMedio = pedidosPagosCount > 0 ? faturamentoBruto / pedidosPagosCount : 0

  // Evolução ordenada por data crescente
  const evolucaoDiaria = Array.from(diasMap.values()).sort((a, b) =>
    a.data.localeCompare(b.data)
  )

  // Produtos mais vendidos ordenados por quantidade desc
  const produtosMaisVendidos = Array.from(produtosVendidosMap.values()).sort(
    (a, b) => b.quantidadeVendida - a.quantidadeVendida || b.faturamento - a.faturamento
  )

  // Categorias mais vendidas por faturamento desc
  const categoriasMaisVendidas = Array.from(categoriasMap.values()).sort(
    (a, b) => b.faturamento - a.faturamento
  )

  // Tamanhos mais vendidos por quantidade desc
  const tamanhosMaisVendidos = Array.from(tamanhosMap.values()).sort(
    (a, b) => b.quantidadeVendida - a.quantidadeVendida
  )

  // Formas de pagamento com percentual
  const formasPagamento = Array.from(formasPagamentoMap.values())
    .map((forma) => ({
      ...forma,
      percentualFaturamento:
        faturamentoBruto > 0 ? (forma.faturamento / faturamentoBruto) * 100 : 0
    }))
    .sort((a, b) => b.faturamento - a.faturamento)

  // Clientes do período
  const clientesDoPeriodo = agruparClientesDosPedidos(listaPedidos)
  const topClientes = [...clientesDoPeriodo]
    .sort((a, b) => b.totalGasto - a.totalGasto || b.pedidos.length - a.pedidos.length)
    .slice(0, 10)

  const clientesNovosPeriodo = clientesDoPeriodo.filter((c) => c.status === 'Novo').length
  const clientesRecorrentesPeriodo = clientesDoPeriodo.filter((c) => c.status === 'Recorrente').length

  // Métricas de estoque
  let totalPecasEstoque = 0
  let produtosEstoqueBaixo = 0
  let produtosSemEstoque = 0
  let valorTotalCusto = 0
  let valorTotalVenda = 0

  for (const p of listaProdutos) {
    const qtd = Number(p.quantidade || 0)
    const custo = Number(p.custo || 0)
    const venda = Number(p.venda || 0)

    totalPecasEstoque += qtd
    if (qtd === 0) {
      produtosSemEstoque += 1
    } else if (qtd <= 3) {
      produtosEstoqueBaixo += 1
    }

    if (custo > 0) {
      valorTotalCusto += qtd * custo
    }
    if (venda > 0) {
      valorTotalVenda += qtd * venda
    }
  }

  return {
    totalPedidos,
    pedidosPagos: pedidosPagosCount,
    pedidosCancelados: pedidosCanceladosCount,
    faturamentoBruto,
    faturamentoLiquido,
    totalDescontos,
    totalFrete,
    ticketMedio,
    totalItensVendidos,
    evolucaoDiaria,
    produtosMaisVendidos,
    categoriasMaisVendidas,
    tamanhosMaisVendidos,
    formasPagamento,
    topClientes,
    totalClientesUnicos: clientesDoPeriodo.length,
    clientesNovos: clientesNovosPeriodo,
    clientesRecorrentes: clientesRecorrentesPeriodo,
    estoque: {
      totalProdutos: listaProdutos.length,
      totalPecasEstoque,
      produtosEstoqueBaixo,
      produtosSemEstoque,
      valorTotalCusto,
      valorTotalVenda
    }
  }
}

export function gerarCsvRelatorio({ metricas, pedidosFiltrados, periodoRotulo = 'Período' }) {
  const linhas = []

  // UTF-8 BOM
  linhas.push('RELATÓRIO DE GESTÃO — BAZAR ENCANTO FEMININO')
  linhas.push(`Período:;${periodoRotulo}`)
  linhas.push(`Gerado em:;${new Date().toLocaleString('pt-BR')}`)
  linhas.push('')

  // 1. Resumo Executivo
  linhas.push('--- RESUMO EXECUTIVO ---')
  linhas.push('Métrica;Valor')
  linhas.push(`Faturamento Bruto;R$ ${metricas.faturamentoBruto.toFixed(2).replace('.', ',')}`)
  linhas.push(`Faturamento Líquido (s/ frete);R$ ${metricas.faturamentoLiquido.toFixed(2).replace('.', ',')}`)
  linhas.push(`Total de Pedidos;${metricas.totalPedidos}`)
  linhas.push(`Pedidos Pagos / Aprovados;${metricas.pedidosPagos}`)
  linhas.push(`Pedidos Cancelados / Recusados;${metricas.pedidosCancelados}`)
  linhas.push(`Ticket Médio;R$ ${metricas.ticketMedio.toFixed(2).replace('.', ',')}`)
  linhas.push(`Total de Itens Vendidos;${metricas.totalItensVendidos}`)
  linhas.push(`Total em Descontos;R$ ${metricas.totalDescontos.toFixed(2).replace('.', ',')}`)
  linhas.push(`Total em Frete;R$ ${metricas.totalFrete.toFixed(2).replace('.', ',')}`)
  linhas.push(`Clientes Únicos no Período;${metricas.totalClientesUnicos}`)
  linhas.push('')

  // 2. Produtos Mais Vendidos
  linhas.push('--- PRODUTOS MAIS VENDIDOS ---')
  linhas.push('Produto;Categoria;Qtd Vendida;Faturamento (R$);Estoque Atual')
  for (const p of metricas.produtosMaisVendidos) {
    linhas.push(
      `"${p.nome.replace(/"/g, '""')}";"${p.categoria}";${p.quantidadeVendida};${p.faturamento.toFixed(2).replace('.', ',')};${p.estoqueAtual}`
    )
  }
  linhas.push('')

  // 3. Formas de Pagamento
  linhas.push('--- FORMAS DE PAGAMENTO ---')
  linhas.push('Forma de Pagamento;Pedidos Totais;Pedidos Aprovados;Faturamento (R$);% Faturamento')
  for (const f of metricas.formasPagamento) {
    linhas.push(
      `"${f.forma}";${f.totalPedidos};${f.pedidosAprovados};${f.faturamento.toFixed(2).replace('.', ',')};${f.percentualFaturamento.toFixed(1).replace('.', ',')}%`
    )
  }
  linhas.push('')

  // 4. Vendas Detalhadas
  linhas.push('--- PEDIDOS DO PERÍODO ---')
  linhas.push('Número;Data;Cliente;E-mail;Forma Pagamento;Status Pedido;Status Pagamento;Total (R$)')
  for (const ped of pedidosFiltrados) {
    const dataFormatada = ped.data ? new Date(ped.data).toLocaleDateString('pt-BR') : '--'
    const totalFormatado = Number(ped.total || 0).toFixed(2).replace('.', ',')
    linhas.push(
      `"${ped.numero}";"${dataFormatada}";"${(ped.cliente || '').replace(/"/g, '""')}";"${ped.email_cliente || ped.email || ''}";"${ped.forma_pagamento || ''}";"${ped.status || ''}";"${ped.status_pagamento || ''}";${totalFormatado}`
    )
  }

  return '\uFEFF' + linhas.join('\r\n')
}

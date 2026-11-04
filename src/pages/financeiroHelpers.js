/**
 * FINANCEIRO HELPERS
 * Bazar Encanto Feminino
 * Utilitários para cálculos financeiros, DRE, fluxo de caixa, estoque a custo e extrato.
 */

export const PERIODOS = {
  HOJE: 'hoje',
  ESTE_MES: 'este_mes',
  MES_ANTERIOR: 'mes_anterior',
  ESTE_ANO: 'este_ano',
  PERSONALIZADO: 'personalizado'
}

export function formatarMoeda(valor) {
  const num = Number(valor || 0)
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

export function formatarPorcentagem(valor) {
  const num = Number(valor || 0)
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
}

export function obterLimitesPeriodo(tipoPeriodo, dataInicialCustom = null, dataFinalCustom = null) {
  const agora = new Date()

  if (tipoPeriodo === PERIODOS.HOJE) {
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0)
    const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999)
    return { inicio, fim, label: 'Hoje' }
  }

  if (tipoPeriodo === PERIODOS.ESTE_MES) {
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0)
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999)
    return { inicio, fim, label: 'Este mês' }
  }

  if (tipoPeriodo === PERIODOS.MES_ANTERIOR) {
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0, 0)
    const fim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999)
    return { inicio, fim, label: 'Mês anterior' }
  }

  if (tipoPeriodo === PERIODOS.ESTE_ANO) {
    const inicio = new Date(agora.getFullYear(), 0, 1, 0, 0, 0, 0)
    const fim = new Date(agora.getFullYear(), 11, 31, 23, 59, 59, 999)
    return { inicio, fim, label: 'Este ano' }
  }

  if (tipoPeriodo === PERIODOS.PERSONALIZADO) {
    const inicio = dataInicialCustom ? new Date(`${dataInicialCustom}T00:00:00`) : new Date(agora.getFullYear(), agora.getMonth(), 1)
    const fim = dataFinalCustom ? new Date(`${dataFinalCustom}T23:59:59.999`) : new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999)
    return { inicio, fim, label: 'Personalizado' }
  }

  // Fallback este mês
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0)
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999)
  return { inicio, fim, label: 'Este mês' }
}

export function estaNoPeriodo(dataIso, inicio, fim) {
  if (!dataIso) return false
  const d = new Date(dataIso)
  if (Number.isNaN(d.getTime())) return false
  return d >= inicio && d <= fim
}

/**
 * Calcula os indicadores financeiros consolidados do Bazar.
 */
export function calcularMetricasFinanceiras({
  socios = [],
  aportes = [],
  retiradas = [],
  despesas = [],
  pedidos = [],
  produtos = [],
  revendas = [],
  tipoPeriodo = PERIODOS.ESTE_MES,
  dataInicioCustom = null,
  dataFimCustom = null
}) {
  const { inicio, fim, label: labelPeriodo } = obterLimitesPeriodo(
    tipoPeriodo,
    dataInicioCustom,
    dataFimCustom
  )

  // 1. APORTES DOS SÓCIOS
  // Total acumulado histórico (patrimonial)
  const totalAportadoHistorico = aportes.reduce((acc, ap) => acc + Number(ap.valor || 0), 0)
  // Aportes no período
  const aportesPeriodo = aportes.filter((ap) => estaNoPeriodo(ap.data || ap.criado_em, inicio, fim))
  const totalAportesPeriodo = aportesPeriodo.reduce((acc, ap) => acc + Number(ap.valor || 0), 0)

  // 2. RETIRADAS DOS SÓCIOS
  // Total acumulado histórico
  const totalRetiradoHistorico = retiradas.reduce((acc, ret) => acc + Number(ret.valor || 0), 0)
  // Retiradas no período
  const retiradasPeriodo = retiradas.filter((ret) => estaNoPeriodo(ret.data || ret.criado_em, inicio, fim))
  const totalRetiradasPeriodo = retiradasPeriodo.reduce((acc, ret) => acc + Number(ret.valor || 0), 0)

  // 3. FATURAMENTO REAL POR ORIGEM (Loja Online, Venda Direta, Revendas)
  // Deduplicação estrita de pedidos pagos
  const pedidosPagosValidos = (Array.isArray(pedidos) ? pedidos : []).filter((p) => {
    const statusPag = String(p.status_pagamento || '').trim().toLowerCase()
    const statusOp = String(p.status || '').trim().toLowerCase()
    const estaPago = ['aprovado', 'approved', 'pago', 'confirmado'].includes(statusPag)
    const naoCancelado = statusOp !== 'cancelado' && statusPag !== 'cancelado' && statusPag !== 'recusado'
    return estaPago && naoCancelado
  })

  // Pedidos pagos no período selecionado
  const pedidosNoPeriodo = pedidosPagosValidos.filter((p) => {
    const dataRef = p.data || p.created_at || p.createdAt || p.criado_em
    return estaNoPeriodo(dataRef, inicio, fim)
  })

  let faturamentoLoja = 0
  let faturamentoVendaDireta = 0
  let cmvPedidosNoPeriodo = 0

  pedidosNoPeriodo.forEach((p) => {
    const totalPedido = Number(p.total ?? 0)
    const origem = String(p.origem || '').trim().toLowerCase()

    if (origem === 'venda_direta') {
      faturamentoVendaDireta += totalPedido
    } else {
      faturamentoLoja += totalPedido
    }

    // CMV dos itens deste pedido
    const itens = Array.isArray(p.itens) ? p.itens : []
    itens.forEach((it) => {
      const custoUnit = Number(it.custo || 0)
      const qtd = Number(it.quantidade || 1)
      cmvPedidosNoPeriodo += custoUnit * qtd
    })
  })

  // Faturamento e CMV de Revendas / Consignações
  let faturamentoRevendas = 0
  let cmvRevendasNoPeriodo = 0

  if (Array.isArray(revendas)) {
    revendas.forEach((remessa) => {
      const itens = Array.isArray(remessa.itens) ? remessa.itens : []
      itens.forEach((it) => {
        const qtdVendida = Number(it.quantidade_vendida || 0)
        if (qtdVendida > 0) {
          const precoVenda = Number(it.preco_venda_sugerido || 0)
          const comissao = Number(it.comissao_percentual || 20)
          const valorLojaUnit = precoVenda * (1 - comissao / 100)
          const custoUnit = Number(it.custo_unitario || 0)

          // Data de referência da remessa/acerto
          const dataRef = remessa.atualizado_em || remessa.data_envio || remessa.criado_em
          if (estaNoPeriodo(dataRef, inicio, fim)) {
            faturamentoRevendas += valorLojaUnit * qtdVendida
            cmvRevendasNoPeriodo += custoUnit * qtdVendida
          }
        }
      })
    })
  }

  const faturamentoTotalPeriodo = faturamentoLoja + faturamentoVendaDireta + faturamentoRevendas
  const cmvTotalPeriodo = cmvPedidosNoPeriodo + cmvRevendasNoPeriodo
  const lucroBrutoPeriodo = faturamentoTotalPeriodo - cmvTotalPeriodo
  const margemBrutaPercentual = faturamentoTotalPeriodo > 0
    ? (lucroBrutoPeriodo / faturamentoTotalPeriodo) * 100
    : 0

  // 4. DESPESAS OPERACIONAIS
  const despesasPeriodo = (Array.isArray(despesas) ? despesas : []).filter((d) =>
    estaNoPeriodo(d.data || d.criado_em, inicio, fim)
  )

  // Despesas operacionais não incluem compra de mercadoria no cálculo de resultado para não duplicar com CMV
  const despesasOperacionaisPeriodo = despesasPeriodo.filter((d) =>
    String(d.categoria || '').trim().toLowerCase() !== 'compra de mercadoria'
  )
  const totalDespesasOperacionais = despesasOperacionaisPeriodo.reduce((acc, d) => acc + Number(d.valor || 0), 0)

  // Total de todas as saídas de despesas (incluindo compra de mercadoria para o fluxo de caixa)
  const totalDespesasCaixaPeriodo = despesasPeriodo.reduce((acc, d) => acc + Number(d.valor || 0), 0)

  // 5. RESULTADO OPERACIONAL / LUCRO LÍQUIDO OPERACIONAL
  const resultadoOperacionalPeriodo = lucroBrutoPeriodo - totalDespesasOperacionais
  const margemLiquidaPercentual = faturamentoTotalPeriodo > 0
    ? (resultadoOperacionalPeriodo / faturamentoTotalPeriodo) * 100
    : 0

  // 6. SALDO FINANCEIRO REGISTRADO NO SISTEMA (Fluxo de Caixa Histórico Consolidado)
  // Entradas totais de caixa: Aportes Históricos + Faturamento Histórico de todos os pedidos pagos
  let totalFaturamentoHistorico = 0
  pedidosPagosValidos.forEach((p) => {
    totalFaturamentoHistorico += Number(p.total ?? 0)
  })
  if (Array.isArray(revendas)) {
    revendas.forEach((remessa) => {
      const itens = Array.isArray(remessa.itens) ? remessa.itens : []
      itens.forEach((it) => {
        const qtdVendida = Number(it.quantidade_vendida || 0)
        if (qtdVendida > 0) {
          const precoVenda = Number(it.preco_venda_sugerido || 0)
          const comissao = Number(it.comissao_percentual || 20)
          totalFaturamentoHistorico += precoVenda * (1 - comissao / 100) * qtdVendida
        }
      })
    })
  }

  const totalDespesasHistorico = (Array.isArray(despesas) ? despesas : []).reduce(
    (acc, d) => acc + Number(d.valor || 0),
    0
  )

  const entradasTotaisCaixa = totalAportadoHistorico + totalFaturamentoHistorico
  const saidasTotaisCaixa = totalDespesasHistorico + totalRetiradoHistorico
  const saldoFinanceiroRegistrado = entradasTotaisCaixa - saidasTotaisCaixa

  // 7. VALOR DO ESTOQUE A CUSTO (Patrimônio)
  // A) Estoque físico na loja
  let valorEstoqueLojaCusto = 0
  let totalPecasEstoqueLoja = 0
  ;(Array.isArray(produtos) ? produtos : []).forEach((prod) => {
    const qtd = Number(prod.quantidade || 0)
    const custo = Number(prod.custo || 0)
    if (qtd > 0) {
      valorEstoqueLojaCusto += qtd * custo
      totalPecasEstoqueLoja += qtd
    }
  })

  // B) Estoque consignado em posse das revendedoras (que ainda pertence ao Bazar)
  let valorEstoqueConsignadoCusto = 0
  let totalPecasConsignadas = 0
  if (Array.isArray(revendas)) {
    revendas.forEach((remessa) => {
      const itens = Array.isArray(remessa.itens) ? remessa.itens : []
      itens.forEach((it) => {
        const saldoPecas = Math.max(
          0,
          Number(it.quantidade_enviada || 0) -
            Number(it.quantidade_vendida || 0) -
            Number(it.quantidade_devolvida || 0)
        )
        const custoUnit = Number(it.custo_unitario || 0)
        if (saldoPecas > 0) {
          valorEstoqueConsignadoCusto += saldoPecas * custoUnit
          totalPecasConsignadas += saldoPecas
        }
      })
    })
  }

  const valorEstoqueTotalCusto = valorEstoqueLojaCusto + valorEstoqueConsignadoCusto
  const totalPecasEstoqueTotal = totalPecasEstoqueLoja + totalPecasConsignadas

  // 8. RESUMO POR SÓCIO
  const sociosComTotais = (Array.isArray(socios) ? socios : []).map((socio) => {
    const aportesSocio = aportes.filter((ap) => Number(ap.socio_id) === Number(socio.id))
    const retiradasSocio = retiradas.filter((ret) => Number(ret.socio_id) === Number(socio.id))

    // Ordenar aportes por data e rodada
    const aportesOrdenados = [...aportesSocio].sort((a, b) => {
      const rodA = Number(a.rodada_numero) || 0
      const rodB = Number(b.rodada_numero) || 0
      if (rodA !== rodB) return rodA - rodB
      const dataA = new Date(a.data || a.criado_em).getTime() || 0
      const dataB = new Date(b.data || b.criado_em).getTime() || 0
      if (dataA !== dataB) return dataA - dataB
      return Number(a.id || 0) - Number(b.id || 0)
    })

    const aportesComRodada = aportesOrdenados.map((ap, idx) => ({
      ...ap,
      numeroAporte: ap.rodada_numero || idx + 1,
      tituloAporte: ap.rodada_nome || `Aporte ${ap.rodada_numero || idx + 1}`
    }))

    const totalAportado = aportesSocio.reduce((acc, ap) => acc + Number(ap.valor || 0), 0)
    const totalRetirado = retiradasSocio.reduce((acc, ret) => acc + Number(ret.valor || 0), 0)
    const saldoHistorico = totalAportado - totalRetirado

    return {
      ...socio,
      totalAportado,
      totalRetirado,
      saldoHistorico,
      aportes: aportesComRodada,
      retiradas: retiradasSocio
    }
  })

  // 9. RESUMO POR RODADA DE APORTE (Global)
  const mapaRodadas = new Map()
  ;(Array.isArray(aportes) ? aportes : []).forEach((ap) => {
    const rodadaNum = Number(ap.rodada_numero) || 1
    const rodadaNome = ap.rodada_nome || `Aporte ${rodadaNum}`
    if (!mapaRodadas.has(rodadaNum)) {
      mapaRodadas.set(rodadaNum, {
        rodada_numero: rodadaNum,
        rodada_nome: rodadaNome,
        total: 0,
        quantidadeLancamentos: 0,
        aportes: []
      })
    }
    const r = mapaRodadas.get(rodadaNum)
    r.total += Number(ap.valor || 0)
    r.quantidadeLancamentos += 1
    r.aportes.push(ap)
  })

  const rodadasResumo = Array.from(mapaRodadas.values()).sort(
    (a, b) => a.rodada_numero - b.rodada_numero
  )

  return {
    periodo: {
      tipo: tipoPeriodo,
      inicio,
      fim,
      label: labelPeriodo
    },
    cards: {
      totalAportado: totalAportadoHistorico,
      totalAportadoPeriodo: totalAportesPeriodo,
      saldoFinanceiro: saldoFinanceiroRegistrado,
      faturamento: faturamentoTotalPeriodo,
      despesas: totalDespesasOperacionais,
      resultado: resultadoOperacionalPeriodo,
      estoqueCusto: valorEstoqueTotalCusto
    },
    rodadas: rodadasResumo,
    faturamentoDetalhado: {
      lojaOnline: faturamentoLoja,
      vendaDireta: faturamentoVendaDireta,
      revendas: faturamentoRevendas,
      total: faturamentoTotalPeriodo
    },
    dre: {
      faturamentoBruto: faturamentoTotalPeriodo,
      cmv: cmvTotalPeriodo,
      lucroBruto: lucroBrutoPeriodo,
      margemBruta: margemBrutaPercentual,
      despesasOperacionais: totalDespesasOperacionais,
      resultadoOperacional: resultadoOperacionalPeriodo,
      margemLiquida: margemLiquidaPercentual
    },
    fluxoCaixa: {
      entradasPeriodo: totalAportesPeriodo + faturamentoTotalPeriodo,
      saidasPeriodo: totalDespesasCaixaPeriodo + totalRetiradasPeriodo,
      saldoGeral: saldoFinanceiroRegistrado
    },
    patrimonioEstoque: {
      lojaCusto: valorEstoqueLojaCusto,
      pecasLoja: totalPecasEstoqueLoja,
      consignadoCusto: valorEstoqueConsignadoCusto,
      pecasConsignado: totalPecasConsignadas,
      totalCusto: valorEstoqueTotalCusto,
      totalPecas: totalPecasEstoqueTotal
    },
    socios: sociosComTotais,
    despesasPeriodo
  }
}

/**
 * Monta o extrato unificado de movimentações financeiras.
 */
export function montarExtratoFinanceiro({
  aportes = [],
  retiradas = [],
  despesas = [],
  pedidos = [],
  revendas = [],
  filtroTipo = 'todos',
  filtroOrigem = 'todos',
  filtroCategoria = 'todos',
  busca = '',
  limite = 200
}) {
  const movimentacoes = []

  // 1. Vendas de Pedidos Pagos
  ;(Array.isArray(pedidos) ? pedidos : []).forEach((p) => {
    const statusPag = String(p.status_pagamento || '').trim().toLowerCase()
    const statusOp = String(p.status || '').trim().toLowerCase()
    const estaPago = ['aprovado', 'approved', 'pago', 'confirmado'].includes(statusPag)
    const naoCancelado = statusOp !== 'cancelado' && statusPag !== 'cancelado' && statusPag !== 'recusado'

    if (estaPago && naoCancelado) {
      const origem = String(p.origem || '').trim().toLowerCase() === 'venda_direta'
        ? 'Venda Direta'
        : 'Loja Online'
      const valor = Number(p.total || 0)
      const data = p.data || p.created_at || p.createdAt || p.criado_em

      movimentacoes.push({
        id: `pedido-${p.id || p.numero}`,
        data: data ? new Date(data).toISOString() : new Date().toISOString(),
        tipo: 'entrada',
        origem,
        categoria: 'Venda de Mercadoria',
        descricao: `Venda #${p.numero || p.id} - ${p.cliente || 'Cliente'}`,
        valor,
        referencia: p.numero || `PED-${p.id}`,
        observacao: `${p.forma_pagamento || 'Pix'} · ${p.modalidade_entrega || 'Entrega'}`
      })
    }
  })

  // 2. Vendas de Revendas / Consignações
  ;(Array.isArray(revendas) ? revendas : []).forEach((remessa) => {
    const itens = Array.isArray(remessa.itens) ? remessa.itens : []
    itens.forEach((it, idx) => {
      const qtdVendida = Number(it.quantidade_vendida || 0)
      if (qtdVendida > 0) {
        const precoVenda = Number(it.preco_venda_sugerido || 0)
        const comissao = Number(it.comissao_percentual || 20)
        const valorLoja = precoVenda * (1 - comissao / 100) * qtdVendida
        const data = remessa.atualizado_em || remessa.data_envio || remessa.criado_em

        movimentacoes.push({
          id: `revenda-${remessa.id || remessa.numero}-${idx}`,
          data: data ? new Date(data).toISOString() : new Date().toISOString(),
          tipo: 'entrada',
          origem: 'Revenda',
          categoria: 'Consignação',
          descricao: `Revenda #${remessa.numero || remessa.id} - ${it.produto_nome || 'Produto'} (${qtdVendida}x)`,
          valor: valorLoja,
          referencia: remessa.numero || `REM-${remessa.id}`,
          observacao: `Comissão revendedora: ${comissao}%`
        })
      }
    })
  })

  // 3. Aportes de Sócios
  ;(Array.isArray(aportes) ? aportes : []).forEach((ap) => {
    const nomeSocio = ap.financeiro_socios?.nome || 'Sócio'
    const finalidade = ap.finalidade || 'Aporte de Capital'
    const rodadaNome = ap.rodada_nome || `Aporte ${ap.rodada_numero || 1}`
    movimentacoes.push({
      id: `aporte-${ap.id}`,
      data: ap.data ? new Date(ap.data).toISOString() : new Date().toISOString(),
      tipo: 'entrada',
      origem: 'Aporte',
      categoria: finalidade,
      descricao: `${rodadaNome} — ${nomeSocio}${ap.observacao ? ` (${ap.observacao})` : ''}`,
      valor: Number(ap.valor || 0),
      referencia: `APORTE-${ap.id}`,
      observacao: `${rodadaNome} · ${finalidade} · ${ap.forma_pagamento || 'Pix'}`
    })
  })

  // 3. Despesas
  ;(Array.isArray(despesas) ? despesas : []).forEach((d) => {
    movimentacoes.push({
      id: `despesa-${d.id}`,
      data: d.data ? new Date(d.data).toISOString() : new Date().toISOString(),
      tipo: 'saida',
      origem: 'Despesa',
      categoria: d.categoria || 'Geral',
      descricao: d.descricao || 'Despesa Operacional',
      valor: Number(d.valor || 0),
      referencia: `DESP-${d.id}`,
      observacao: d.observacao || `${d.forma_pagamento || 'Pix'}`
    })
  })

  // 4. Retiradas de Sócios
  ;(Array.isArray(retiradas) ? retiradas : []).forEach((ret) => {
    const nomeSocio = ret.financeiro_socios?.nome || 'Sócio'
    movimentacoes.push({
      id: `retirada-${ret.id}`,
      data: ret.data ? new Date(ret.data).toISOString() : new Date().toISOString(),
      tipo: 'saida',
      origem: 'Retirada',
      categoria: ret.tipo || 'Distribuição de lucro',
      descricao: `Retirada - ${nomeSocio} (${ret.tipo || 'Distribuição'})`,
      valor: Number(ret.valor || 0),
      referencia: `RET-${ret.id}`,
      observacao: ret.observacao || `${ret.forma_pagamento || 'Pix'}`
    })
  })

  // Ordena por data decrescente (mais recente primeiro)
  const ordenadas = movimentacoes.sort((a, b) => {
    const timeA = new Date(a.data).getTime() || 0
    const timeB = new Date(b.data).getTime() || 0
    return timeB - timeA
  })

  // Filtros
  const filtradas = ordenadas.filter((mov) => {
    // Filtro Tipo (entrada / saida)
    if (filtroTipo !== 'todos' && mov.tipo !== filtroTipo) {
      return false
    }

    // Filtro Origem
    if (filtroOrigem !== 'todos' && mov.origem.toLowerCase() !== filtroOrigem.toLowerCase()) {
      return false
    }

    // Filtro Categoria
    if (filtroCategoria !== 'todos' && mov.categoria.toLowerCase() !== filtroCategoria.toLowerCase()) {
      return false
    }

    // Filtro Busca
    if (busca && busca.trim()) {
      const termo = busca.trim().toLowerCase()
      const matchDesc = mov.descricao.toLowerCase().includes(termo)
      const matchRef = (mov.referencia || '').toLowerCase().includes(termo)
      const matchCat = mov.categoria.toLowerCase().includes(termo)
      const matchObs = (mov.observacao || '').toLowerCase().includes(termo)
      if (!matchDesc && !matchRef && !matchCat && !matchObs) {
        return false
      }
    }

    return true
  })

  return filtradas.slice(0, limite)
}

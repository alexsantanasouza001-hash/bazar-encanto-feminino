import { dataContabilVenda, vendaAguardandoRecebimento, vendaContaNoFinanceiro } from '../../lib/recebimentoVenda.js'
// =====================================================
// HELPERS DO PORTAL DA REVENDEDORA
// BAZAR ENCANTO FEMININO
// =====================================================

export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

export function formatarData(dataIso, incluirHora = false) {
  if (!dataIso) return '-'
  try {
    const d = new Date(dataIso)
    if (isNaN(d.getTime())) return '-'
    if (incluirHora) {
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    return d.toLocaleDateString('pt-BR')
  } catch {
    return '-'
  }
}

export function calcularSaldoItemConsignado(item) {
  if (!item) return 0
  const enviada = Number(item.quantidade_enviada || 0)
  const vendida = Number(item.quantidade_vendida || 0)
  const devolvida = Number(item.quantidade_devolvida || 0)
  const reservada = Number(item.quantidade_reservada || 0)
  return Math.max(0, enviada - vendida - devolvida - reservada)
}

export function calcularResumoDashboard(remessas = [], vendas = [], pagamentos = [], revendedora = null) {
  const listaRemessas = Array.isArray(remessas) ? remessas : []
  const listaVendas = Array.isArray(vendas) ? vendas : []
  const listaPagamentos = Array.isArray(pagamentos) ? pagamentos : []

  let pecasComigo = 0
  let totalRecebidas = 0
  let totalDevolvidas = 0

  for (const rem of listaRemessas) {
    const itens = Array.isArray(rem.itens) ? rem.itens : []
    for (const item of itens) {
      totalRecebidas += Number(item.quantidade_enviada || 0)
      totalDevolvidas += Number(item.quantidade_devolvida || 0)
      pecasComigo += calcularSaldoItemConsignado(item)
    }
  }

  // Vendas confirmadas
  const vendasConfirmadas = listaVendas.filter(
    (v) => (v.status || 'CONFIRMADA').toUpperCase() === 'CONFIRMADA'
  )

  // Vendas aguardando conferência
  const vendasPendentes = listaVendas.filter(
    (v) => (v.status || '').toUpperCase() === 'AGUARDANDO_CONFERENCIA'
  )

  const totalPecasVendidas = vendasConfirmadas.reduce(
    (acc, v) => acc + Number(v.quantidade || 0),
    0
  )

  // Dinheiro só conta quando a data de recebimento chegou (vendas de marketplace etc.)
  const vendasRecebidas = vendasConfirmadas.filter((v) => vendaContaNoFinanceiro(v))
  const vendasAReceber = vendasConfirmadas.filter((v) => vendaAguardandoRecebimento(v))
  const valorAReceber = vendasAReceber.reduce(
    (acc, v) => acc + Number(v.total_venda ?? v.valor_total_bruto ?? 0),
    0
  )

  const totalVendido = vendasRecebidas.reduce(
    (acc, v) => acc + Number(v.total_venda ?? v.valor_total_bruto ?? 0),
    0
  )

  let minhaComissao = 0
  let valorBazar = 0

  if (revendedora?.usa_divisao_lucro) {
    const consolidacao = calcularConsolidacaoFinanceira(vendasRecebidas, revendedora, listaRemessas)
    minhaComissao = consolidacao.totalRevendedora
    valorBazar = consolidacao.valorDevidoBazar
  } else {
    minhaComissao = vendasRecebidas.reduce(
      (acc, v) => acc + Number(v.valor_comissao || 0),
      0
    )
    valorBazar = vendasRecebidas.reduce(
      (acc, v) => acc + Number(v.valor_loja || 0),
      0
    )
  }

  const totalRepassado = listaPagamentos.reduce(
    (acc, p) => acc + Number(p.valor || 0),
    0
  )

  const saldoRepassar = Math.max(0, Number((valorBazar - totalRepassado).toFixed(2)))

  return {
    pecasComigo,
    disponiveis: pecasComigo,
    vendidas: totalPecasVendidas,
    totalRecebidas,
    totalDevolvidas,
    vendasPendentesQtd: vendasPendentes.length,
    vendasConfirmadasQtd: vendasConfirmadas.length,
    vendasAReceberQtd: vendasAReceber.length,
    valorAReceber: Number(valorAReceber.toFixed(2)),
    totalVendido: Number(totalVendido.toFixed(2)),
    minhaComissao: Number(minhaComissao.toFixed(2)),
    valorBazar: Number(valorBazar.toFixed(2)),
    totalRepassado: Number(totalRepassado.toFixed(2)),
    saldoRepassar
  }
}

export function calcularExtratoContaCorrente(vendas = [], pagamentos = []) {
  const listaVendas = Array.isArray(vendas) ? vendas : []
  const listaPagamentos = Array.isArray(pagamentos) ? pagamentos : []

  // Somente vendas confirmadas afetam a conta corrente oficial
  const lancamentos = []

  for (const v of listaVendas) {
    const status = (v.status || 'CONFIRMADA').toUpperCase()
    if (status === 'CONFIRMADA' && !vendaAguardandoRecebimento(v)) {
      const valorDevido = Number(v.valor_loja || 0)
      lancamentos.push({
        id: `venda-${v.id}`,
        tipo: 'VENDA',
        data: v.data_recebimento || v.data_venda || v.criado_em,
        descricao: `Venda ${v.produto_nome || 'Peça'} (${v.quantidade} un. - Remessa ${v.numero_remessa || `#${v.remessa_id}`})`,
        debito: 0,
        credito: valorDevido,
        detalhes: {
          vendaId: v.id,
          quantidade: v.quantidade,
          valorTotal: v.total_venda ?? v.valor_total_bruto,
          comissao: v.valor_comissao
        }
      })
    }
  }

  for (const p of listaPagamentos) {
    const valorPago = Number(p.valor || 0)
    lancamentos.push({
      id: `pagamento-${p.id}`,
      tipo: 'PAGAMENTO',
      data: p.data_pagamento || p.criado_em,
      descricao: `Repasse confirmado via ${p.forma_pagamento || 'Pix'}${p.observacao ? ` (${p.observacao})` : ''}`,
      debito: valorPago,
      credito: 0,
      detalhes: {
        pagamentoId: p.id,
        formaPagamento: p.forma_pagamento
      }
    })
  }

  // Ordena cronologicamente por data asc para calcular saldo acumulado
  lancamentos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())

  let saldoAcumulado = 0
  const extratoComSaldo = lancamentos.map((item) => {
    saldoAcumulado = Number((saldoAcumulado + item.credito - item.debito).toFixed(2))
    return {
      ...item,
      saldoApos: saldoAcumulado
    }
  })

  // Retorna com os lançamentos mais recentes primeiro para visualização
  return extratoComSaldo.reverse()
}

export function filtrarPecasDisponiveis(remessas = [], termoBusca = '') {
  if (!Array.isArray(remessas)) return []
  const busca = String(termoBusca || '').trim().toLowerCase()

  const todasPecas = []

  for (const rem of remessas) {
    const itens = Array.isArray(rem.itens) ? rem.itens : []
    for (const item of itens) {
      const disponivel = calcularSaldoItemConsignado(item)
      if (disponivel > 0) {
        todasPecas.push({
          ...item,
          remessa_numero: rem.numero || `REM-${String(rem.id).padStart(6, '0')}`,
          remessa_data: rem.data_envio,
          disponivel_venda: disponivel
        })
      }
    }
  }

  if (!busca) return todasPecas

  return todasPecas.filter((p) => {
    const nome = String(p.produto_nome || '').toLowerCase()
    const sku = String(p.sku || '').toLowerCase()
    const tam = String(p.tamanho || '').toLowerCase()
    const cor = String(p.cor || '').toLowerCase()
    return (
      nome.includes(busca) ||
      sku.includes(busca) ||
      tam.includes(busca) ||
      cor.includes(busca)
    )
  })
}

export function simularValoresVenda({
  quantidade,
  precoUnitario,
  precoRepasse,
  comissaoPercentual = 20,
  percentualDesconto = 0,
  valorDesconto = 0
}) {
  const qtd = Math.max(0, Number(quantidade || 0))
  const preco = Math.max(0, Number(precoUnitario || 0))
  const repasseUnit = Math.max(0, Number(precoRepasse || 0))
  const comissPerc = Math.min(100, Math.max(0, Number(comissaoPercentual || 0)))

  const subtotal = Number((qtd * preco).toFixed(2))

  let descValor = 0
  let descPerc = 0

  if (valorDesconto !== undefined && valorDesconto !== null && Number(valorDesconto) > 0) {
    descValor = Number(Math.min(subtotal, Math.max(0, Number(valorDesconto))).toFixed(2))
    descPerc = subtotal > 0 ? Number(((descValor / subtotal) * 100).toFixed(2)) : 0
  } else if (percentualDesconto !== undefined && percentualDesconto !== null && Number(percentualDesconto) > 0) {
    descPerc = Math.min(100, Math.max(0, Number(percentualDesconto)))
    descValor = Number(((subtotal * descPerc) / 100).toFixed(2))
  }

  const totalVenda = Number(Math.max(0, subtotal - descValor).toFixed(2))
  const repasseTotal = Number((qtd * repasseUnit).toFixed(2))

  // Comissão SEMPRE sobre o total da venda, mesmo pelo preço do repasse (regra desde 04/11/2026).
  void repasseTotal
  let comissao = 0
  if (totalVenda > 0 && comissPerc > 0) {
    comissao = Number(((totalVenda * comissPerc) / 100).toFixed(2))
  }
  const valorLoja = Number((totalVenda - comissao).toFixed(2))

  return {
    quantidade: qtd,
    precoUnitario: preco,
    subtotal,
    percentualDesconto: descPerc,
    valorDesconto: descValor,
    totalVenda,
    comissao,
    valorLoja
  }
}

/**
 * Custo real unitário da venda: snapshot custo_unitario do item da remessa (sem frete).
 * Fallback: valor de repasse gravado na venda (quando as remessas não foram informadas).
 */
function custoRealUnitarioVenda(venda, remessas) {
  const remessa = (Array.isArray(remessas) ? remessas : []).find((r) => Number(r.id) === Number(venda.remessa_id))
  const item = remessa?.itens?.find((i) => Number(i.id) === Number(venda.remessa_item_id))
  if (item && item.custo_unitario != null && Number(item.custo_unitario) > 0) {
    return Number(item.custo_unitario)
  }
  return Number(venda.valor_repasse_unitario != null ? venda.valor_repasse_unitario : 0)
}

export function calcularConsolidacaoFinanceira(vendas, revendedora, remessas = []) {
  // Apenas vendas estritamente CONFIRMADAS
  // Vendas com recebimento futuro ainda não entram no acerto.
  const vendasConfirmadas = (Array.isArray(vendas) ? vendas : []).filter(
    (v) => vendaContaNoFinanceiro(v)
  )

  let totalVendas = 0
  let comissaoTotal = 0
  let custoTotal = 0

  for (const v of vendasConfirmadas) {
    const qtd = Math.max(0, Number(v.quantidade || 0))
    const valorFinal = Number((v.total_venda != null ? v.total_venda : v.valor_total_bruto) || 0)
    const comissao = Number(v.valor_comissao || 0)
    // Acerto usa o CUSTO REAL da mercadoria (sem frete) — regra desde 04/11/2026.
    const custoUnit = custoRealUnitarioVenda(v, remessas)

    totalVendas += valorFinal
    comissaoTotal += comissao
    custoTotal += Number((qtd * custoUnit).toFixed(2))
  }

  totalVendas = Number(totalVendas.toFixed(2))
  comissaoTotal = Number(comissaoTotal.toFixed(2))
  custoTotal = Number(custoTotal.toFixed(2))

  // LUCRO LÍQUIDO = TOTAL DE VENDAS - CUSTO TOTAL - COMISSÃO TOTAL
  const lucroLiquido = Number(Math.max(0, totalVendas - custoTotal - comissaoTotal).toFixed(2))

  const usaDivisao = Boolean(revendedora?.usa_divisao_lucro)
  const percRev = usaDivisao ? Math.min(100, Math.max(0, Number(revendedora?.percentual_lucro_revendedora || 0))) : 0
  const percBazar = usaDivisao ? Number((100 - percRev).toFixed(2)) : 0

  let parteLucroRevendedora = 0
  let parteLucroBazar = 0

  if (usaDivisao && lucroLiquido > 0) {
    parteLucroRevendedora = Number(((lucroLiquido * percRev) / 100).toFixed(2))
    // Ajuste exato de centavos para fechar a soma com o lucro líquido
    parteLucroBazar = Number((lucroLiquido - parteLucroRevendedora).toFixed(2))
  }

  // TOTAL DA REVENDEDORA = COMISSÃO TOTAL + PARTICIPAÇÃO NO LUCRO LÍQUIDO
  const totalRevendedora = Number((comissaoTotal + parteLucroRevendedora).toFixed(2))

  // VALOR A SER PAGO AO BAZAR = CUSTO TOTAL + PARTICIPAÇÃO DO BAZAR NO LUCRO LÍQUIDO
  let valorDevidoBazar = 0
  if (usaDivisao) {
    valorDevidoBazar = Number((custoTotal + parteLucroBazar).toFixed(2))
  } else {
    // Se não usa divisão especial, mantém a regra atual de consignação
    valorDevidoBazar = Number((totalVendas - comissaoTotal).toFixed(2))
  }

  return {
    quantidadeVendasConfirmadas: vendasConfirmadas.length,
    totalVendas,
    comissaoTotal,
    custoTotal,
    lucroLiquido,
    usaDivisao,
    percentualRevendedora: percRev,
    percentualBazar: percBazar,
    parteLucroRevendedora,
    parteLucroBazar,
    totalRevendedora,
    valorDevidoBazar
  }
}

/**
 * Filtra vendas para consolidação na aba Acertos ou Resumo:
 * - Apenas vendas com status 'CONFIRMADA'
 * - Filtro opcional por remessa (id ou número)
 * - Filtro opcional por período ('todos', 'este_mes', 'mes_anterior', 'personalizado')
 */
export function filtrarVendasConsolidacao({
  vendas = [],
  periodo = 'todos',
  dataInicio = '',
  dataFim = '',
  remessaId = 'todas'
}) {
  const lista = Array.isArray(vendas) ? vendas : []
  return lista.filter((v) => {
    // 1. Somente CONFIRMADAS
    const status = (v.status || 'CONFIRMADA').toUpperCase()
    if (status !== 'CONFIRMADA') return false
    if (vendaAguardandoRecebimento(v)) return false

    // 2. Filtro por Remessa
    if (remessaId && remessaId !== 'todas') {
      const matchId = String(v.remessa_id) === String(remessaId)
      const matchNum = String(v.numero_remessa || '') === String(remessaId)
      if (!matchId && !matchNum) return false
    }

    // 3. Filtro por Período
    if (periodo && periodo !== 'todos') {
      // Venda com data de recebimento entra no período do dia em que o dinheiro caiu.
      const dataStr = dataContabilVenda(v)
      if (!dataStr) return false

      if (periodo === 'este_mes') {
        const hoje = new Date()
        const anoMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
        if (!dataStr.startsWith(anoMesAtual)) return false
      } else if (periodo === 'mes_anterior') {
        const hoje = new Date()
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
        const anoMesAnterior = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!dataStr.startsWith(anoMesAnterior)) return false
      } else if (periodo === 'personalizado') {
        if (dataInicio && dataStr < dataInicio) return false
        if (dataFim && dataStr > dataFim) return false
      }
    }

    return true
  })
}

const SUPABASE_STORAGE_URL_PRODUTOS = 'https://vqfqqxzzdaqkbwtgzarh.supabase.co/storage/v1/object/public/produtos'

/**
 * Converte qualquer URL ou caminho relativo do Supabase Storage no link público definitivo.
 */
export function obterUrlFotoPublica(caminhoOuUrl) {
  if (!caminhoOuUrl || typeof caminhoOuUrl !== 'string') return null
  const limpo = caminhoOuUrl.trim()
  if (!limpo) return null
  if (
    limpo.startsWith('http://') ||
    limpo.startsWith('https://') ||
    limpo.startsWith('data:') ||
    limpo.startsWith('blob:')
  ) {
    return limpo
  }
  const path = limpo.startsWith('produtos/') ? limpo.substring('produtos/'.length) : limpo
  return `${SUPABASE_STORAGE_URL_PRODUTOS}/${path.replace(/^\/+/, '')}`
}

/**
 * Resolve a imagem real de um produto/variação da revenda.
 * Prioridade:
 * 1. Foto específica da variação/cor (item.foto_variacao, item.variacao_foto, item.fotos[0], etc.)
 * 2. Foto principal do produto (item.foto_produto, item.produto_foto, item.foto, item.imagem, etc.)
 * 3. null (para renderizar o fallback seguro "Sem foto")
 */
export function resolverImagemProdutoRevenda(item) {
  if (!item) return null

  // 1. Foto específica da variação
  const fotoVariacao = item.foto_variacao || item.variacao_foto
  if (fotoVariacao) {
    const url = obterUrlFotoPublica(fotoVariacao)
    if (url) return url
  }

  // Se o objeto tiver array de fotos (ex: variação com fotos JSON ou produto com fotos)
  if (Array.isArray(item.fotos) && item.fotos.length > 0) {
    const f = item.fotos[0]
    const raw = typeof f === 'string' ? f : (f?.foto || f?.url)
    const url = obterUrlFotoPublica(raw)
    if (url) return url
  }

  // 2. Foto principal do produto
  const fotoProduto = item.foto_produto || item.produto_foto || item.foto || item.imagem || item.image
  if (fotoProduto) {
    const url = obterUrlFotoPublica(fotoProduto)
    if (url) return url
  }

  return null
}

/**
 * Agrupa as peças no Portal da Revendedora por Produto + Variação/Cor + Remessa.
 * Exibe um único card por produto/cor na mesma remessa com sua grade de tamanhos (P, M, G).
 */
export function agruparPecasPortalPorProdutoVariacaoRemessa(remessas = [], termoBusca = '', remessaFiltro = 'todas') {
  const listaRemessas = Array.isArray(remessas) ? remessas : []
  const remessasFiltradas = remessaFiltro === 'todas'
    ? listaRemessas
    : listaRemessas.filter((r) => String(r.id) === String(remessaFiltro))

  const gruposMap = new Map()

  for (const rem of remessasFiltradas) {
    const itens = Array.isArray(rem.itens) ? rem.itens : []
    const remNumero = rem.numero || `REM-${String(rem.id).padStart(6, '0')}`

    for (const item of itens) {
      const prodId = item.produto_id
      const varId = item.variacao_id || 'sem_var'
      const chave = `${rem.id}_${prodId}_${varId}`

      const fotoResolvida = resolverImagemProdutoRevenda(item) || resolverImagemProdutoRevenda(rem)

      if (!gruposMap.has(chave)) {
        gruposMap.set(chave, {
          chave,
          remessa_id: rem.id,
          remessa_numero: remNumero,
          remessa_data: rem.data_envio,
          remessa_status: rem.status,
          produto_id: prodId,
          produto_nome: item.produto_nome || 'Produto',
          sku: item.sku || '',
          foto_variacao: item.foto_variacao || null,
          foto_produto: item.foto_produto || null,
          foto: fotoResolvida,
          variacao_id: item.variacao_id || null,
          cor: item.cor || 'Única',
          cor_hex: item.cor_hex || '#b76e79',
          preco_venda_sugerido: Number(item.preco_venda_sugerido || item.valor_repasse_base || 0),
          comissao_percentual: Number(item.comissao_percentual ?? 20),
          total_recebido: 0,
          total_vendido: 0,
          total_devolvido: 0,
          total_reservado: 0,
          total_disponivel: 0,
          tamanhos: []
        })
      }

      const grupo = gruposMap.get(chave)
      if (!grupo.foto && fotoResolvida) {
        grupo.foto = fotoResolvida
      }

      const enviada = Number(item.quantidade_enviada || item.quantidade || 0)
      const vendida = Number(item.quantidade_vendida || 0)
      const devolvida = Number(item.quantidade_devolvida || 0)
      const reservada = Number(item.quantidade_reservada || 0)
      const disponivel = Math.max(0, enviada - vendida - devolvida - reservada)

      grupo.total_recebido += enviada
      grupo.total_vendido += vendida
      grupo.total_devolvido += devolvida
      grupo.total_reservado += reservada
      grupo.total_disponivel += disponivel

      grupo.tamanhos.push({
        id: item.id,
        produto_tamanho_id: item.produto_tamanho_id,
        tamanho: item.tamanho || 'Único',
        recebido: enviada,
        vendido: vendida,
        devolvido: devolvida,
        reservado: reservada,
        disponivel,
        preco_venda_sugerido: Number(item.preco_venda_sugerido || item.valor_repasse_base || 0),
        comissao_percentual: Number(item.comissao_percentual ?? 20),
        itemOriginal: item
      })
    }
  }

  let lista = Array.from(gruposMap.values())

  if (termoBusca && String(termoBusca).trim()) {
    const b = String(termoBusca).trim().toLowerCase()
    lista = lista.filter((g) => {
      const matchNome = (g.produto_nome || '').toLowerCase().includes(b)
      const matchSku = (g.sku || '').toLowerCase().includes(b)
      const matchCor = (g.cor || '').toLowerCase().includes(b)
      const matchRem = (g.remessa_numero || '').toLowerCase().includes(b)
      const matchTam = g.tamanhos.some((t) => (t.tamanho || '').toLowerCase().includes(b))
      return matchNome || matchSku || matchCor || matchRem || matchTam
    })
  }

  return lista
}

/**
 * Agrupa produtos para a busca na tela de Registrar Venda:
 * Agrupa por: remessa_id + produto_id + variacao_id
 * Retorna grupos com lista de tamanhos e disponibilidades.
 */
export function agruparProdutosParaVenda(remessas = [], termoBusca = '') {
  const listaRemessas = Array.isArray(remessas) ? remessas : []
  const gruposMap = new Map()

  for (const rem of listaRemessas) {
    const itens = Array.isArray(rem.itens) ? rem.itens : []
    const remNumero = rem.numero || `REM-${String(rem.id).padStart(6, '0')}`

    for (const item of itens) {
      const prodId = item.produto_id
      const varId = item.variacao_id || 'sem_var'
      const chave = `${rem.id}_${prodId}_${varId}`

      const disponivel = calcularSaldoItemConsignado(item)
      const fotoResolvida = resolverImagemProdutoRevenda(item) || resolverImagemProdutoRevenda(rem)

      if (!gruposMap.has(chave)) {
        gruposMap.set(chave, {
          chave,
          remessa_id: rem.id,
          remessa_numero: remNumero,
          remessa_data: rem.data_envio,
          produto_id: prodId,
          produto_nome: item.produto_nome || 'Produto',
          sku: item.sku || '',
          foto_variacao: item.foto_variacao || null,
          foto_produto: item.foto_produto || null,
          foto: fotoResolvida,
          variacao_id: item.variacao_id || null,
          cor: item.cor || 'Única',
          cor_hex: item.cor_hex || '#b76e79',
          preco_venda_sugerido: Number(item.preco_venda_sugerido || item.valor_repasse_base || 0),
          comissao_percentual: Number(item.comissao_percentual ?? 20),
          total_disponivel: 0,
          tamanhos: []
        })
      }

      const grupo = gruposMap.get(chave)
      if (!grupo.foto && fotoResolvida) {
        grupo.foto = fotoResolvida
      }

      grupo.total_disponivel += disponivel

      grupo.tamanhos.push({
        id: item.id,
        produto_tamanho_id: item.produto_tamanho_id,
        tamanho: item.tamanho || 'Único',
        disponivel_venda: disponivel,
        preco_venda_sugerido: Number(item.preco_venda_sugerido || item.valor_repasse_base || 0),
        comissao_percentual: Number(item.comissao_percentual ?? 20),
        itemOriginal: item
      })
    }
  }

  let lista = Array.from(gruposMap.values())

  // Filtrar apenas produtos que possuem pelo menos 1 unidade disponível no total
  lista = lista.filter((g) => g.total_disponivel > 0)

  if (termoBusca && String(termoBusca).trim()) {
    const b = String(termoBusca).trim().toLowerCase()
    lista = lista.filter((g) => {
      const matchNome = (g.produto_nome || '').toLowerCase().includes(b)
      const matchSku = (g.sku || '').toLowerCase().includes(b)
      const matchCor = (g.cor || '').toLowerCase().includes(b)
      const matchRem = (g.remessa_numero || '').toLowerCase().includes(b)
      const matchTam = g.tamanhos.some((t) => (t.tamanho || '').toLowerCase().includes(b))
      return matchNome || matchSku || matchCor || matchRem || matchTam
    })
  }

  return lista
}


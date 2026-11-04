import { dataContabilVenda, vendaAguardandoRecebimento, vendaContaNoFinanceiro } from '../lib/recebimentoVenda.js'
export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

export function formatarTelefone(valor) {
  const digits = String(valor || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return valor || 'Não informado'
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

export function calcularComissao(valorVendido, percentualComissao, valorRepasse = 0) {
  const valor = Number(valorVendido || 0)
  const perc = Number(percentualComissao || 0)
  // Regra desde 04/11/2026: a comissão é SEMPRE o percentual sobre o valor vendido,
  // mesmo quando a peça é vendida pelo mesmo preço (ou abaixo) do repasse.
  // valorRepasse é mantido na assinatura só por compatibilidade.
  void valorRepasse
  if (valor <= 0 || perc <= 0) {
    return 0
  }

  return Number(((valor * perc) / 100).toFixed(2))
}

export function calcularValorLoja(valorVendido, percentualComissao, valorRepasse = 0) {
  const valor = Number(valorVendido || 0)
  const comissao = calcularComissao(valor, percentualComissao, valorRepasse)
  return Number((valor - comissao).toFixed(2))
}

export function calcularSaldoConsignadoItem(item) {
  if (!item) return 0
  const enviada = Number(item.quantidade_enviada || item.quantidade || 0)
  const vendida = Number(item.quantidade_vendida || 0)
  const devolvida = Number(item.quantidade_devolvida || 0)
  return Math.max(0, enviada - vendida - devolvida)
}

export function calcularProximoAcerto(
  dataReferencia,
  periodicidadeDias = 15,
  agora = new Date()
) {
  const base = dataReferencia ? new Date(dataReferencia) : new Date(agora)
  if (Number.isNaN(base.getTime())) {
    const hoje = new Date(agora)
    hoje.setDate(hoje.getDate() + Number(periodicidadeDias || 15))
    return hoje
  }

  const proximo = new Date(base)
  proximo.setDate(proximo.getDate() + Number(periodicidadeDias || 15))
  return proximo
}

export function verificarAcertoAtrasado(dataVencimento, agora = new Date()) {
  if (!dataVencimento) return false
  let dataVenc
  if (typeof dataVencimento === 'string' && dataVencimento.length === 10 && dataVencimento.includes('-')) {
    const [ano, mes, dia] = dataVencimento.split('-').map(Number)
    dataVenc = new Date(ano, mes - 1, dia, 23, 59, 59, 999)
  } else {
    dataVenc = new Date(dataVencimento)
    dataVenc.setHours(23, 59, 59, 999)
  }
  if (Number.isNaN(dataVenc.getTime())) return false

  const ref = new Date(agora)
  return dataVenc.getTime() < ref.getTime()
}

export function calcularDescontoPercentual(subtotal, percentualDesconto) {
  const sub = Number(subtotal || 0)
  const perc = Number(percentualDesconto || 0)
  if (sub <= 0 || perc <= 0) return 0
  return Number(((sub * perc) / 100).toFixed(2))
}

export function validarPercentualDesconto(percentual) {
  if (percentual === '' || percentual === null || percentual === undefined) {
    return { valido: true, percentual: 0 }
  }
  const num = Number(percentual)
  if (isNaN(num)) {
    return { valido: false, erro: 'O percentual de desconto deve ser um número válido.' }
  }
  if (num < 0) {
    return { valido: false, erro: 'O desconto não pode ser negativo.' }
  }
  if (num > 100) {
    return { valido: false, erro: 'O desconto não pode ser superior a 100%.' }
  }
  return { valido: true, percentual: num }
}

export function calcularTotaisLinhasVenda(
  linhasVenda = [],
  percentualComissao = 0,
  valorRepasseUnitario = 0,
  percentualDesconto = 0
) {
  if (!Array.isArray(linhasVenda) || linhasVenda.length === 0) {
    return {
      totalQuantidade: 0,
      subtotalVenda: 0,
      totalBruto: 0,
      percentualDesconto: 0,
      valorDesconto: 0,
      totalVenda: 0,
      totalComissao: 0,
      totalLoja: 0,
      grupos: []
    }
  }

  let totalQuantidade = 0
  let totalSubtotal = 0
  let totalComissao = 0
  const grupos = []

  const percDesc = Math.min(100, Math.max(0, Number(percentualDesconto || 0)))

  for (const linha of linhasVenda) {
    const qtd = Math.max(0, Number(linha.quantidade || 0))
    const preco = Math.max(0, Number(linha.precoUnitario || 0))
    const repasseUnit = Number(linha.valorRepasse ?? valorRepasseUnitario ?? 0)
    const itemSubtotal = Number((qtd * preco).toFixed(2))
    const itemDesconto = Number(((itemSubtotal * percDesc) / 100).toFixed(2))
    const itemTotal = Number((itemSubtotal - itemDesconto).toFixed(2))
    const itemRepasseTotal = Number((qtd * repasseUnit).toFixed(2))

    // Comissão SEMPRE calculada sobre o total final da linha (após desconto),
    // mesmo quando a venda é pelo preço do repasse (regra desde 04/11/2026).
    void itemRepasseTotal
    let comissao = 0
    if (itemTotal > 0 && percentualComissao > 0) {
      comissao = Number(((itemTotal * percentualComissao) / 100).toFixed(2))
    }

    const loja = Number((itemTotal - comissao).toFixed(2))

    totalQuantidade += qtd
    totalSubtotal += itemSubtotal
    totalComissao += comissao

    grupos.push({
      quantidade: qtd,
      precoUnitario: preco,
      valorRepasse: repasseUnit,
      subtotal: itemSubtotal,
      valorBruto: itemSubtotal,
      percentualDesconto: percDesc,
      valorDesconto: itemDesconto,
      totalVenda: itemTotal,
      valorComissao: comissao,
      valorLoja: loja
    })
  }

  const subtotalFmt = Number(totalSubtotal.toFixed(2))
  const valorDescontoFmt = Number(((subtotalFmt * percDesc) / 100).toFixed(2))
  const totalVendaFmt = Number(Math.max(0, subtotalFmt - valorDescontoFmt).toFixed(2))
  const totalComissaoFmt = Number(totalComissao.toFixed(2))
  const totalLojaFmt = Number((totalVendaFmt - totalComissaoFmt).toFixed(2))

  return {
    totalQuantidade,
    subtotalVenda: subtotalFmt,
    totalBruto: subtotalFmt,
    percentualDesconto: percDesc,
    valorDesconto: valorDescontoFmt,
    totalVenda: totalVendaFmt,
    totalComissao: totalComissaoFmt,
    totalLoja: totalLojaFmt,
    grupos
  }
}

export function validarLinhasVenda(linhasVenda = [], saldoDisponivel = 0) {
  if (!Array.isArray(linhasVenda) || linhasVenda.length === 0) {
    return { valido: false, erro: 'Informe ao menos uma linha de venda.' }
  }

  let totalQtd = 0

  for (let i = 0; i < linhasVenda.length; i++) {
    const linha = linhasVenda[i]
    const qtd = Number(linha.quantidade)
    const preco = Number(linha.precoUnitario)

    if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) {
      return { valido: false, erro: `Linha ${i + 1}: Informe uma quantidade inteira maior que zero.` }
    }

    if (preco === undefined || preco === null || isNaN(preco) || preco <= 0) {
      return { valido: false, erro: `Linha ${i + 1}: Informe um valor de venda unitário maior que zero.` }
    }

    totalQtd += qtd
  }

  if (totalQtd > saldoDisponivel) {
    return {
      valido: false,
      erro: `A soma das quantidades informadas (${totalQtd}) não pode ultrapassar o saldo disponível (${saldoDisponivel} un.).`
    }
  }

  return { valido: true, erro: null }
}

/**
 * Custo unitário usado no ACERTO com a revendedora: snapshot custo_unitario do item da remessa
 * (custo real, sem frete). Se o item não tiver custo gravado, usa o valor de repasse da venda.
 * MESMA regra do Portal da Revendedora (portalHelpers.custoRealUnitarioVenda) — os dois precisam
 * fechar centavo a centavo.
 */
export function obterCustoRealUnitarioVenda(venda, remessas = []) {
  const remessa = (Array.isArray(remessas) ? remessas : []).find((r) => Number(r.id) === Number(venda?.remessa_id))
  const item = remessa?.itens?.find((i) => Number(i.id) === Number(venda?.remessa_item_id))
  if (item && item.custo_unitario != null && Number(item.custo_unitario) > 0) {
    return Number(item.custo_unitario)
  }
  return Number(venda?.valor_repasse_unitario || 0)
}

export function consolidarResumoRevendedora(revendedora, remessas = [], vendas = [], pagamentos = []) {
  if (!revendedora) return null

  const remessasRev = Array.isArray(remessas)
    ? remessas.filter((r) => Number(r.revendedora_id) === Number(revendedora.id))
    : []

  let pecasConsignadas = 0
  let valorConsignado = 0

  for (const remessa of remessasRev) {
    const itens = Array.isArray(remessa.itens) ? remessa.itens : []
    for (const item of itens) {
      const saldo = calcularSaldoConsignadoItem(item)
      pecasConsignadas += saldo
      valorConsignado += saldo * Number(item.preco_venda_sugerido || 0)
    }
  }

  // Venda com recebimento futuro ainda não soma no financeiro.
  const vendasRev = Array.isArray(vendas)
    ? vendas.filter((v) => Number(v.revendedora_id) === Number(revendedora.id) && !vendaAguardandoRecebimento(v))
    : []

  let totalVendidoBruto = 0
  let totalComissao = 0
  let totalDevidoLoja = 0
  let custoTotal = 0

  for (const venda of vendasRev) {
    const totalVenda = Number(venda.total_venda != null ? venda.total_venda : venda.valor_total_bruto || 0)
    const comissao = Number(venda.valor_comissao || 0)
    // Acerto com divisão de lucro usa o CUSTO REAL da peça (snapshot da remessa), sem frete.
    const custo = Number(venda.quantidade || 1) * obterCustoRealUnitarioVenda(venda, remessasRev)

    totalVendidoBruto += totalVenda
    totalComissao += comissao
    custoTotal += custo
    totalDevidoLoja += Number(venda.valor_loja || 0)
  }

  // Se a revendedora tem divisão de lucro ativa, o valor devido ao Bazar é:
  // Custo Total + Participação do Bazar no Lucro Líquido
  if (revendedora.usa_divisao_lucro) {
    const percRev = Number(revendedora.percentual_lucro_revendedora ?? 40.00)
    const percBazar = Number((100 - percRev).toFixed(2))
    const lucroLiquido = Math.max(0, Number((totalVendidoBruto - custoTotal - totalComissao).toFixed(2)))
    const parteLucroBazar = Number((lucroLiquido * (percBazar / 100.0)).toFixed(2))
    totalDevidoLoja = Number((custoTotal + parteLucroBazar).toFixed(2))
  }

  const pagamentosRev = Array.isArray(pagamentos)
    ? pagamentos.filter((p) => {
        if (Number(p.revendedora_id) !== Number(revendedora.id)) return false
        // Apenas pagamentos CONFIRMADOS reduzem o saldo
        return (p.status || 'CONFIRMADO') === 'CONFIRMADO'
      })
    : []

  let totalPago = 0
  for (const pag of pagamentosRev) {
    totalPago += Number(pag.valor_confirmado != null ? pag.valor_confirmado : pag.valor || 0)
  }

  const saldoPendente = Math.max(0, Number((totalDevidoLoja - totalPago).toFixed(2)))
  const proximoAcerto = calcularProximoAcerto(
    revendedora.ultimo_acerto_em || revendedora.data_inicio,
    revendedora.periodicidade_acerto_dias || 15
  )
  const atrasado = saldoPendente > 0 && verificarAcertoAtrasado(proximoAcerto)

  return {
    id: revendedora.id,
    nome: revendedora.nome,
    status: revendedora.status || 'Ativa',
    comissaoPadrao: Number(revendedora.comissao_padrao || 20),
    periodicidadeDias: Number(revendedora.periodicidade_acerto_dias || 15),
    pecasConsignadas,
    valorConsignado: Number(valorConsignado.toFixed(2)),
    totalVendidoBruto: Number(totalVendidoBruto.toFixed(2)),
    totalComissao: Number(totalComissao.toFixed(2)),
    totalDevidoLoja: Number(totalDevidoLoja.toFixed(2)),
    totalPago: Number(totalPago.toFixed(2)),
    saldoPendente,
    proximoAcerto: proximoAcerto.toISOString().slice(0, 10),
    atrasado
  }
}

export function obterPrecosVendaPraticadosItem(remessaItemId, vendas = []) {
  if (!remessaItemId || !Array.isArray(vendas)) return []
  return vendas
    .filter((v) => Number(v.remessa_item_id) === Number(remessaItemId))
    .map((v) => {
      const subtotal = Number(v.subtotal_venda ?? v.valor_total_bruto ?? (Number(v.quantidade || 0) * Number(v.preco_unitario_vendido || 0)))
      const descPerc = Number(v.percentual_desconto || 0)
      const descValor = Number(v.valor_desconto || 0)
      const totalLiquido = Number(v.total_venda ?? (subtotal - descValor))
      return {
        id: v.id,
        quantidade: Number(v.quantidade || 0),
        precoUnitario: Number(v.preco_unitario_vendido || 0),
        subtotal,
        percentualDesconto: descPerc,
        valorDesconto: descValor,
        totalLiquido,
        valorBruto: subtotal,
        valorComissao: Number(v.valor_comissao || 0),
        valorLoja: Number(v.valor_loja || 0),
        dataVenda: v.data_venda
      }
    })
}

export function obterTotalValorVendidoItem(remessaItemId, vendas = []) {
  if (!remessaItemId || !Array.isArray(vendas)) return 0
  const vendasItem = vendas.filter((v) => Number(v.remessa_item_id) === Number(remessaItemId))
  const total = vendasItem.reduce((acc, v) => {
    const liquido = v.total_venda != null
      ? Number(v.total_venda)
      : (v.valor_total_bruto != null
          ? Number(v.valor_total_bruto) - Number(v.valor_desconto || 0)
          : (Number(v.quantidade || 0) * Number(v.preco_unitario_vendido || 0)) - Number(v.valor_desconto || 0))
    return acc + liquido
  }, 0)
  return Number(total.toFixed(2))
}

export function agruparVendasPorRemessa(remessas = [], vendas = []) {
  if (!Array.isArray(remessas)) return []
  const listaVendas = Array.isArray(vendas) ? vendas : []

  return remessas.map((rem) => {
    const vendasRemessa = listaVendas.filter((v) => Number(v.remessa_id) === Number(rem.id))
    const totalSubtotal = vendasRemessa.reduce((acc, v) => acc + Number(v.subtotal_venda ?? v.valor_total_bruto ?? (Number(v.quantidade || 0) * Number(v.preco_unitario_vendido || 0))), 0)
    const totalDesconto = vendasRemessa.reduce((acc, v) => acc + Number(v.valor_desconto || 0), 0)
    const totalVendido = vendasRemessa.reduce((acc, v) => acc + Number(v.total_venda ?? (Number(v.subtotal_venda ?? v.valor_total_bruto ?? 0) - Number(v.valor_desconto || 0))), 0)
    const totalComissao = vendasRemessa.reduce((acc, v) => acc + Number(v.valor_comissao || 0), 0)
    const valorAcerto = vendasRemessa.reduce((acc, v) => acc + Number(v.valor_loja || 0), 0)
    const totalPecasVendidas = vendasRemessa.reduce((acc, v) => acc + Number(v.quantidade || 0), 0)

    // CUSTO = SOMA(valor_repasse_historico * quantidade_vendida)
    const totalCusto = vendasRemessa.reduce((acc, v) => {
      const repasseHistorico = Number(v.valor_repasse_unitario ?? v.preco_venda_sugerido ?? 0)
      const qtd = Number(v.quantidade || 0)
      return acc + (repasseHistorico * qtd)
    }, 0)

    // LUCRO LÍQUIDO = VALOR DO ACERTO - CUSTO
    const lucroLiquido = valorAcerto - totalCusto

    const itens = Array.isArray(rem.itens) ? rem.itens : []
    const totalPecasEnviadas = itens.reduce((acc, i) => acc + Number(i.quantidade_enviada || 0), 0)
    const totalPecasDevolvidas = itens.reduce((acc, i) => acc + Number(i.quantidade_devolvida || 0), 0)
    const saldoConsignado = Math.max(0, totalPecasEnviadas - totalPecasVendidas - totalPecasDevolvidas)

    return {
      remessa_id: rem.id,
      numero: rem.numero || `REM-${String(rem.id).padStart(6, '0')}`,
      revendedora_id: rem.revendedora_id,
      revendedora_nome: rem.revendedora_nome || rem.revendedoras?.nome || 'Revendedora',
      data_envio: rem.data_envio || rem.criado_em,
      status: rem.status || 'Enviada',
      totalPecasEnviadas,
      totalPecasVendidas,
      totalPecasDevolvidas,
      saldoConsignado,
      totalSubtotal: Number(totalSubtotal.toFixed(2)),
      totalDesconto: Number(totalDesconto.toFixed(2)),
      totalVendido: Number(totalVendido.toFixed(2)),
      totalComissao: Number(totalComissao.toFixed(2)),
      valorAcerto: Number(valorAcerto.toFixed(2)),
      custo: Number(totalCusto.toFixed(2)),
      lucroLiquido: Number(lucroLiquido.toFixed(2)),
      vendasQtd: vendasRemessa.length
    }
  })
}

export function validarEdicaoRemessa(itens = []) {
  if (!Array.isArray(itens) || itens.length === 0) {
    return { valido: false, erro: 'A remessa precisa conter ao menos um produto.' }
  }

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]
    const qtd = Number(item.quantidade_enviada ?? item.quantidade)
    const minQtd = Number(item.min_quantidade || 0)
    const preco = Number(item.preco_venda_sugerido)

    if (!item.produto_id) {
      return { valido: false, erro: `Item ${i + 1}: Selecione um produto válido.` }
    }

    if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) {
      return { valido: false, erro: `Item ${i + 1}: Informe uma quantidade válida maior que zero.` }
    }

    if (minQtd > 0 && qtd < minQtd) {
      return {
        valido: false,
        erro: `Item "${item.produto_nome || i + 1}": Quantidade não pode ser reduzida abaixo do que já foi movimentado (${minQtd} un.).`
      }
    }

    if (preco === undefined || preco === null || isNaN(preco) || preco < 0) {
      return { valido: false, erro: `Item ${i + 1}: Informe um valor de repasse válido.` }
    }
  }

  return { valido: true, erro: null }
}

// =====================================================
// HELPERS DE BUSCA E SELEÇÃO DE PRODUTOS PARA REMESSAS
// (PADRÃO IDÊNTICO À VENDA DIRETA)
// =====================================================

export function filtrarProdutosBusca(produtos = [], termo = '') {
  if (!Array.isArray(produtos)) return []
  const busca = String(termo || '').trim().toLowerCase()
  if (!busca) return []

  return produtos.filter((p) => {
    if (!p) return false
    const nome = String(p.nome || '').toLowerCase()
    const sku = String(p.sku || '').toLowerCase()
    const marca = String(p.marca || '').toLowerCase()
    return nome.includes(busca) || sku.includes(busca) || marca.includes(busca)
  }).slice(0, 15)
}

export function obterCoresProduto(produto) {
  if (!produto) return []
  if (Array.isArray(produto.variacoes) && produto.variacoes.length > 0) {
    return produto.variacoes.map((v) => ({
      id: v.id,
      cor: v.cor_nome || v.cor || 'Única',
      cor_hex: v.cor_hex || '#b76e79',
      variacao: v
    }))
  }
  return [{
    id: null,
    cor: produto.cor || 'Única',
    cor_hex: produto.cor_hex || '#b76e79',
    variacao: null
  }]
}

export function obterTamanhosDisponiveis(produto, variacao) {
  if (!produto) return []
  if (variacao && Array.isArray(variacao.tamanhos)) {
    return variacao.tamanhos
  }
  if (Array.isArray(produto.tamanhos) && produto.tamanhos.length > 0) {
    return produto.tamanhos
  }
  return [{
    id: null,
    tamanho: 'Único',
    quantidade: produto.quantidade || 0
  }]
}

export function obterEstoqueDisponivel(produto, variacao, tamanhoNome) {
  if (!produto) return 0
  const tamanhos = obterTamanhosDisponiveis(produto, variacao)
  if (!tamanhoNome) {
    if (variacao && typeof variacao.quantidade === 'number') {
      return variacao.quantidade
    }
    return Number(produto.quantidade || 0)
  }
  const reg = tamanhos.find((t) => t.tamanho === tamanhoNome)
  return reg ? Number(reg.quantidade || 0) : (variacao ? Number(variacao.quantidade || 0) : Number(produto.quantidade || 0))
}

export function validarAdicaoItemRemessa({
  produto,
  quantidade,
  precoRepasse,
  comissaoPercentual,
  estoqueDisponivel
}) {
  if (!produto || !produto.id) {
    return { valido: false, erro: 'Selecione um produto cadastrado.' }
  }

  const qtd = Number(quantidade)
  if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) {
    return { valido: false, erro: 'Informe uma quantidade válida maior que 0.' }
  }

  const disp = Number(estoqueDisponivel || 0)
  if (qtd > disp) {
    return {
      valido: false,
      erro: `Quantidade informada (${qtd}) excede o estoque disponível na loja (${disp}).`
    }
  }

  const preco = Number(precoRepasse)
  if (preco === undefined || preco === null || isNaN(preco) || preco < 0) {
    return { valido: false, erro: 'Informe um valor de repasse válido.' }
  }

  const comissao = Number(comissaoPercentual)
  if (comissao === undefined || comissao === null || isNaN(comissao) || comissao < 0 || comissao > 100) {
    return { valido: false, erro: 'Informe um percentual de comissão entre 0% e 100%.' }
  }

  return { valido: true, erro: null }
}

export function calcularRateioFrete(totalFrete, totalPecas) {
  const frete = Number(totalFrete || 0)
  const pecas = Number(totalPecas || 0)
  if (frete <= 0 || pecas <= 0) return 0
  return Number((frete / pecas).toFixed(2))
}

export function montarItemRemessa({
  produto,
  variacao,
  tamanhoObj,
  quantidade,
  precoRepasse,
  valorRepasseBase,
  freteRateado = 0,
  comissaoPercentual
}) {
  const tamNome = typeof tamanhoObj === 'string' ? tamanhoObj : (tamanhoObj?.tamanho || 'Único')
  const tamId = tamanhoObj && typeof tamanhoObj === 'object' && tamanhoObj.id ? String(tamanhoObj.id) : null
  const varId = variacao?.id || null
  const corNome = variacao?.cor_nome || variacao?.cor || produto?.cor || 'Única'
  const corHex = variacao?.cor_hex || produto?.cor_hex || '#b76e79'

  const repBase = Number(valorRepasseBase !== undefined && valorRepasseBase !== null ? valorRepasseBase : (precoRepasse || 0))
  const freteUnit = Number(freteRateado || 0)
  const repEfetivo = Number((repBase + freteUnit).toFixed(2))

  return {
    produto_id: produto.id,
    produto_nome: produto.nome,
    sku: produto.sku || '',
    marca: produto.marca || '',
    variacao_id: varId,
    produto_tamanho_id: tamId,
    tamanho: tamNome,
    cor: corNome,
    cor_hex: corHex,
    quantidade: Number(quantidade || 1),
    valor_repasse_base: repBase,
    frete_rateado_unitario: freteUnit,
    preco_venda_sugerido: repEfetivo,
    comissao_percentual: Number(comissaoPercentual ?? 20)
  }
}

/**
 * Valida a grade de tamanhos ao adicionar um produto na Remessa (Admin).
 * Valida disponibilidade por tamanho individual, bloqueando caso exceda estoque ou seja negativo.
 */
export function validarGradeTamanhosRemessa({
  produto,
  variacao,
  tamanhosDisponiveis = [],
  gradeQuantidades = {},
  precoRepasse,
  comissaoPercentual
}) {
  if (!produto || !produto.id) {
    return { valido: false, erro: 'Selecione um produto cadastrado.' }
  }

  const preco = Number(precoRepasse)
  if (preco === undefined || preco === null || isNaN(preco) || preco < 0) {
    return { valido: false, erro: 'Informe um valor de repasse válido.' }
  }

  const comissao = Number(comissaoPercentual)
  if (comissao === undefined || comissao === null || isNaN(comissao) || comissao < 0 || comissao > 100) {
    return { valido: false, erro: 'Informe um percentual de comissão entre 0% e 100%.' }
  }

  let totalQtd = 0
  const itensMontados = []

  for (const tam of tamanhosDisponiveis) {
    const tamKey = tam.tamanho || 'Único'
    const qtdInformada = Number(gradeQuantidades[tamKey] || 0)

    if (qtdInformada < 0) {
      return { valido: false, erro: `A quantidade para o tamanho ${tamKey} não pode ser negativa.` }
    }

    if (qtdInformada > 0) {
      const disp = Number(tam.quantidade || 0)
      if (qtdInformada > disp) {
        return {
          valido: false,
          erro: `Quantidade informada (${qtdInformada}) excede o estoque disponível para o tamanho ${tamKey} (${disp} un.).`
        }
      }

      totalQtd += qtdInformada
      itensMontados.push(
        montarItemRemessa({
          produto,
          variacao,
          tamanhoObj: tam,
          quantidade: qtdInformada,
          precoRepasse: preco,
          valorRepasseBase: preco,
          comissaoPercentual: comissao
        })
      )
    }
  }

  if (totalQtd <= 0) {
    return { valido: false, erro: 'Informe pelo menos uma quantidade maior que zero em algum tamanho.' }
  }

  return { valido: true, erro: null, itensMontados, totalQtd }
}

/**
 * Agrupa itens planos da remessa (antigos ou novos) por Produto + Variação/Cor.
 * Mantém grade de tamanhos com suas quantidades e metadados.
 */
export function agruparItensRemessaPorProdutoVariacao(itens = []) {
  if (!Array.isArray(itens)) return []
  const gruposMap = new Map()

  for (const item of itens) {
    const prodId = item.produto_id || item.produtoId
    const varId = item.variacao_id || item.variacaoId || 'sem_var'
    const repBase = Number(item.valor_repasse_base !== undefined && item.valor_repasse_base !== null ? item.valor_repasse_base : (item.preco_venda_sugerido || 0))
    const comissao = Number(item.comissao_percentual ?? 20)
    
    // Chave de agrupamento: produto + variacao/cor
    const chave = `${prodId}_${varId}`

    if (!gruposMap.has(chave)) {
      gruposMap.set(chave, {
        chave,
        produto_id: prodId,
        produto_nome: item.produto_nome || item.nome || 'Produto',
        sku: item.sku || '',
        marca: item.marca || '',
        foto: item.foto || null,
        variacao_id: item.variacao_id || null,
        cor: item.cor || 'Única',
        cor_hex: item.cor_hex || '#b76e79',
        valor_repasse_base: repBase,
        preco_venda_sugerido: Number(item.preco_venda_sugerido || repBase),
        comissao_percentual: comissao,
        frete_rateado_unitario: Number(item.frete_rateado_unitario || 0),
        total_quantidade: 0,
        total_enviada: 0,
        total_vendida: 0,
        total_devolvida: 0,
        total_disponivel: 0,
        grades: []
      })
    }

    const grupo = gruposMap.get(chave)
    const qtd = Number(item.quantidade_enviada !== undefined ? item.quantidade_enviada : (item.quantidade || 0))
    const vendida = Number(item.quantidade_vendida || 0)
    const devolvida = Number(item.quantidade_devolvida || 0)
    const reservada = Number(item.quantidade_reservada || 0)
    const disp = Math.max(0, qtd - vendida - devolvida - reservada)

    grupo.total_quantidade += qtd
    grupo.total_enviada += qtd
    grupo.total_vendida += vendida
    grupo.total_devolvida += devolvida
    grupo.total_disponivel += disp

    grupo.grades.push({
      id: item.id || null,
      produto_tamanho_id: item.produto_tamanho_id ? String(item.produto_tamanho_id) : null,
      tamanho: item.tamanho || 'U',
      quantidade: qtd,
      quantidade_enviada: qtd,
      quantidade_vendida: vendida,
      quantidade_devolvida: devolvida,
      quantidade_reservada: reservada,
      disponivel: disp,
      min_quantidade: Number(item.min_quantidade ?? vendida),
      valor_repasse_base: repBase,
      preco_venda_sugerido: Number(item.preco_venda_sugerido || repBase),
      comissao_percentual: comissao,
      itemOriginal: item
    })
  }

  return Array.from(gruposMap.values())
}

/**
 * Converte grupos da interface de volta para a lista plana de revenda_remessa_itens
 * pronta para ser enviada para criar_remessa_consignacao ou editar_remessa_consignacao.
 */
export function desagruparItensRemessa(grupos = []) {
  if (!Array.isArray(grupos)) return []
  const itensPlanos = []

  for (const g of grupos) {
    if (!Array.isArray(g.grades)) continue
    for (const grade of g.grades) {
      const qtd = Number(grade.quantidade_enviada !== undefined ? grade.quantidade_enviada : (grade.quantidade || 0))
      // Se quantidade > 0 ou se já tinha id salvo no banco
      if (qtd > 0 || grade.id) {
        itensPlanos.push({
          id: grade.id || null,
          produto_id: g.produto_id,
          produto_nome: g.produto_nome,
          sku: g.sku || '',
          marca: g.marca || '',
          variacao_id: g.variacao_id || null,
          produto_tamanho_id: grade.produto_tamanho_id || null,
          tamanho: grade.tamanho,
          cor: g.cor,
          cor_hex: g.cor_hex,
          quantidade: qtd,
          quantidade_enviada: qtd,
          quantidade_vendida: Number(grade.quantidade_vendida || 0),
          quantidade_devolvida: Number(grade.quantidade_devolvida || 0),
          min_quantidade: Number(grade.min_quantidade || 0),
          valor_repasse_base: Number(g.valor_repasse_base !== undefined ? g.valor_repasse_base : (grade.valor_repasse_base || 0)),
          preco_venda_sugerido: Number(g.preco_venda_sugerido !== undefined ? g.preco_venda_sugerido : (grade.preco_venda_sugerido || 0)),
          frete_rateado_unitario: Number(g.frete_rateado_unitario || 0),
          comissao_percentual: Number(g.comissao_percentual ?? 20)
        })
      }
    }
  }

  return itensPlanos
}

/**
 * Helper central e determinístico para divisão de lucro (Comercial ou Econômico):
 * Aplica o percentual cadastrado sobre a base de lucro, calculando a parte da revendedora
 * e garantindo fechamento perfeito em centavos: parteBazar = base - parteRevendedora.
 */
export function calcularDivisaoLucro(baseLucro, percentualRevendedora) {
  const base = Number(Number(baseLucro || 0).toFixed(2))
  const percRev = Math.max(0, Math.min(100, Number(percentualRevendedora || 0)))
  const percBazar = Math.max(0, 100 - percRev)

  if (base <= 0 || percRev <= 0) {
    return {
      base,
      percRevendedora: percRev,
      percBazar,
      parteRevendedora: 0,
      parteBazar: base
    }
  }

  const parteRevendedora = Number(((base * percRev) / 100).toFixed(2))
  const parteBazar = Number((base - parteRevendedora).toFixed(2))

  return {
    base,
    percRevendedora: percRev,
    percBazar,
    parteRevendedora,
    parteBazar
  }
}

/**
 * Detalha individualmente uma venda para as visões administrativa e comercial:
 * 1. Consolidado Comercial: Baseado no Valor de Repasse
 * 2. Divisão Econômica Real: Baseado no Custo Real de Aquisição
 */
export function detalharVendaFinanceiraAdmin(venda, revendedora, remessas = [], produtos = []) {
  const quantidade = Number(venda.quantidade || 1)
  const vendaBruta = Number(venda.subtotal_venda ?? venda.valor_total_bruto ?? (Number(venda.preco_unitario_vendido || 0) * quantidade))
  const valorDesconto = Number(venda.valor_desconto || 0)
  const percentualDesconto = Number(venda.percentual_desconto || 0)
  const vendaLiquida = Number(venda.total_venda ?? (vendaBruta - valorDesconto))
  const comissao = Number(venda.valor_comissao || 0)

  // 1. Snapshot confiável de Custo Real de Aquisição (Interno Bazar)
  const remessa = (Array.isArray(remessas) ? remessas : []).find((r) => Number(r.id) === Number(venda.remessa_id))
  const itemRemessa = remessa?.itens?.find((i) => Number(i.id) === Number(venda.remessa_item_id))

  let custoUnitario = 0
  if (itemRemessa && itemRemessa.custo_unitario != null && Number(itemRemessa.custo_unitario) > 0) {
    custoUnitario = Number(itemRemessa.custo_unitario)
  } else {
    const prod = (Array.isArray(produtos) ? produtos : []).find((p) => Number(p.id) === Number(venda.produto_id))
    custoUnitario = Number(prod?.custo || 0)
  }

  // 2. Snapshot de Valor de Repasse Histórico (Usado no Consolidado Comercial da Revendedora)
  let valorRepasseUnitario = 0
  if (venda.valor_repasse_unitario != null && Number(venda.valor_repasse_unitario) > 0) {
    valorRepasseUnitario = Number(venda.valor_repasse_unitario)
  } else if (itemRemessa && itemRemessa.preco_venda_sugerido != null && Number(itemRemessa.preco_venda_sugerido) > 0) {
    valorRepasseUnitario = Number(itemRemessa.preco_venda_sugerido)
  } else if (itemRemessa && itemRemessa.valor_repasse_base != null && Number(itemRemessa.valor_repasse_base) > 0) {
    valorRepasseUnitario = Number(itemRemessa.valor_repasse_base)
  } else if (custoUnitario > 0) {
    valorRepasseUnitario = custoUnitario
  } else {
    valorRepasseUnitario = Number(venda.preco_unitario_vendido || 0)
  }

  // 3. Frete rateado unitário
  const freteUnitario = itemRemessa && itemRemessa.frete_rateado_unitario != null ? Number(itemRemessa.frete_rateado_unitario) : 0
  const freteOperacional = Number((freteUnitario * quantidade).toFixed(2))

  const custoReal = Number((custoUnitario * quantidade).toFixed(2))
  // Desde 04/11/2026 o acerto com a revendedora (Resultado Consolidado) usa o CUSTO REAL
  // da mercadoria, sem frete: Devido ao Bazar = Custo Real + % do Bazar sobre
  // (Venda - Comissão - Custo Real). O valor de repasse fica só como referência
  // (custoRepasse / valorRepasseUnitario). O frete continua apenas na Divisão Econômica Real (interna).
  const custoRepasse = Number((valorRepasseUnitario * quantidade).toFixed(2))
  const custoAcerto = Number((obterCustoRealUnitarioVenda(venda, remessas) * quantidade).toFixed(2))

  // Percentual individual da revendedora
  let percRevendedora = 0
  if (revendedora && revendedora.percentual_lucro_revendedora != null && !isNaN(Number(revendedora.percentual_lucro_revendedora))) {
    percRevendedora = Number(revendedora.percentual_lucro_revendedora)
  } else if (revendedora?.usa_divisao_lucro) {
    percRevendedora = 40
  }
  const percBazar = Math.max(0, 100 - percRevendedora)
  const usaDivisao = percRevendedora > 0 || Boolean(revendedora?.usa_divisao_lucro)

  // ====================================================================
  // A) RESULTADO CONSOLIDADO / ACERTO COM A REVENDEDORA (Baseado no CUSTO REAL, sem frete)
  // ====================================================================
  const lucroComercial = Number((vendaLiquida - custoAcerto - comissao).toFixed(2))
  const divisaoComercial = calcularDivisaoLucro(lucroComercial, percRevendedora)
  const parteRevendedoraLucroComercial = divisaoComercial.parteRevendedora
  const parteBazarLucroComercial = divisaoComercial.parteBazar

  const totalEconomicoRevendedoraComercial = Number((comissao + parteRevendedoraLucroComercial).toFixed(2))
  const valorDevidoAoBazar = Number((custoAcerto + parteBazarLucroComercial).toFixed(2))

  // ====================================================================
  // B) DIVISÃO DO RESULTADO ECONÔMICO REAL DO BAZAR (Baseado no CUSTO REAL)
  // A participação da revendedora é EXATAMENTE a mesma do Consolidado.
  // O Lucro Real do Bazar é obtido por RESÍDUO: Venda - Custo - Frete - Comissão - ParteRevendedora
  // ====================================================================
  const parteRevendedoraLucroReal = parteRevendedoraLucroComercial
  const lucroOperacionalReal = Number((vendaLiquida - custoReal - freteOperacional - comissao).toFixed(2))
  const lucroRealBazar = Number((vendaLiquida - custoReal - freteOperacional - comissao - parteRevendedoraLucroReal).toFixed(2))
  const parteBazarLucroReal = lucroRealBazar

  const custoRecuperadoBazar = custoReal
  const totalRetidoBazar = Number((custoRecuperadoBazar + freteOperacional + lucroRealBazar).toFixed(2))

  const margemOperacionalReal = vendaLiquida > 0 ? (lucroOperacionalReal / vendaLiquida) * 100 : 0
  const margemRealBazar = vendaLiquida > 0 ? (lucroRealBazar / vendaLiquida) * 100 : 0
  const margemBruta = vendaLiquida > 0 ? ((vendaLiquida - custoReal) / vendaLiquida) * 100 : 0
  const margemAposComissao = vendaLiquida > 0 ? ((vendaLiquida - custoReal - comissao) / vendaLiquida) * 100 : 0

  return {
    ...venda,
    vendaBruta,
    valorDesconto,
    percentualDesconto,
    vendaLiquida,
    quantidade,
    comissao,
    custoUnitario,
    custoReal,
    valorRepasseUnitario,
    custoRepasse,
    custoAcerto,
    freteUnitario,
    freteOperacional,
    usaDivisao,
    percRevendedora,
    percBazar,

    // Consolidado Comercial (Repasse)
    lucroComercial,
    parteRevendedoraLucroComercial,
    parteBazarLucroComercial,
    totalEconomicoRevendedora: totalEconomicoRevendedoraComercial,
    totalEconomicoRevendedoraComercial,
    valorDevidoAoBazar: Number((custoReal + parteBazarLucroReal).toFixed(2)),
    valorDevidoAoBazarComercial: valorDevidoAoBazar,

    // Divisão Econômica Real (Custo Real)
    lucroOperacionalReal,
    lucroOperacao: lucroOperacionalReal,
    parteRevendedoraLucroReal,
    parteRevendedoraLucro: parteRevendedoraLucroReal,
    parteBazarLucroReal,
    parteBazarLucro: parteBazarLucroReal,
    lucroRealBazar,
    custoRecuperadoBazar,
    totalRetidoBazar,
    resultadoEconomicoBazar: totalRetidoBazar,

    // Margens
    margemOperacionalReal,
    margemRealBazar,
    margemBruta,
    margemAposComissao,
    margemBazar: margemRealBazar
  }
}

/**
 * Consolida o Painel Financeiro e todos os Cards de Métricas para o Admin,
 * aplicando filtros de Revendedora, Remessa e Período.
 */
export function calcularPainelFinanceiroAdmin({
  vendas = [],
  revendedoras = [],
  remessas = [],
  pagamentos = [],
  produtos = [],
  filtroRevendedoraId = 'todas',
  filtroRemessaId = 'todas',
  filtroPeriodo = 'todos',
  dataInicioCustom = '',
  dataFimCustom = ''
}) {
  // 1. Filtrar vendas confirmadas
  // Vendas com data de recebimento no futuro ficam de fora até o dinheiro cair.
  let vendasFiltradas = (Array.isArray(vendas) ? vendas : []).filter(
    (v) => vendaContaNoFinanceiro(v)
  )

  if (filtroRevendedoraId !== 'todas' && filtroRevendedoraId) {
    vendasFiltradas = vendasFiltradas.filter(
      (v) => Number(v.revendedora_id) === Number(filtroRevendedoraId)
    )
  }

  if (filtroRemessaId !== 'todas' && filtroRemessaId) {
    vendasFiltradas = vendasFiltradas.filter(
      (v) => Number(v.remessa_id) === Number(filtroRemessaId)
    )
  }

  // Filtro de período nas vendas.
  // IMPORTANTE: comparar sempre pelo TEXTO da data ("AAAA-MM-DD"), nunca via `new Date(...)`.
  // data_venda é salva sem horário (ex: "2026-08-13"), e `new Date('AAAA-MM-DD')` é interpretado
  // como meia-noite UTC, enquanto `new Date('AAAA-MM-DDTHH:mm:ss')` (sem 'Z') e os getters
  // getFullYear()/getMonth() usam horário LOCAL. No fuso do Brasil (UTC-3) essa mistura desloca a
  // janela em ~3h e faz vendas do dia seguinte ao filtro "vazarem" para dentro do período (ou vendas
  // do primeiro dia ficarem de fora). O Portal da Revendedora (filtrarVendasConsolidacao) já compara
  // por texto puro — aqui replicamos a mesma lógica para os dois baterem sempre.
  const hoje = new Date()
  const anoMesAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const dAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const anoMesAnteriorStr = `${dAnt.getFullYear()}-${String(dAnt.getMonth() + 1).padStart(2, '0')}`

  if (filtroPeriodo === 'mes_atual') {
    vendasFiltradas = vendasFiltradas.filter((v) =>
      dataContabilVenda(v).startsWith(anoMesAtualStr)
    )
  } else if (filtroPeriodo === 'mes_anterior') {
    vendasFiltradas = vendasFiltradas.filter((v) =>
      dataContabilVenda(v).startsWith(anoMesAnteriorStr)
    )
  } else if (filtroPeriodo === 'personalizado') {
    if (dataInicioCustom) {
      vendasFiltradas = vendasFiltradas.filter(
        (v) => dataContabilVenda(v) >= dataInicioCustom
      )
    }
    if (dataFimCustom) {
      vendasFiltradas = vendasFiltradas.filter(
        (v) => dataContabilVenda(v) <= dataFimCustom
      )
    }
  }

  // 2. Detalhar cada venda filtrada
  const vendasDetalhadas = vendasFiltradas.map((v) => {
    const rev = (Array.isArray(revendedoras) ? revendedoras : []).find(
      (r) => Number(r.id) === Number(v.revendedora_id)
    )
    return detalharVendaFinanceiraAdmin(v, rev, remessas, produtos)
  })

  // 3. Totais Acumulados
  let totalVendidoBruto = 0
  let totalDescontos = 0
  let totalVendaLiquida = 0
  let totalPecasVendidas = 0
  let totalComissao = 0

  // Consolidado Comercial / Acerto (Custo Real, sem frete)
  let totalCustoRepasse = 0
  let totalCustoAcerto = 0
  let totalLucroLiquido = 0
  let totalParteRevendedoraLucro = 0
  let totalParteBazarLucro = 0
  let totalDevidoBazar = 0

  // Divisão Econômica Real (Custo Real)
  let totalCustoReal = 0
  let totalFreteOperacional = 0
  let totalLucroOperacionalReal = 0
  let totalParteRevendedoraLucroReal = 0
  let totalParteBazarLucroReal = 0

  for (const v of vendasDetalhadas) {
    totalVendidoBruto += v.vendaBruta
    totalDescontos += v.valorDesconto
    totalVendaLiquida += v.vendaLiquida
    totalPecasVendidas += v.quantidade
    totalComissao += v.comissao
    totalCustoRepasse += v.custoRepasse
    totalCustoAcerto += v.custoAcerto
    totalCustoReal += v.custoReal
    totalFreteOperacional += v.freteOperacional
  }

  // Divisão de lucro (Comercial e Real): agrupar por revendedora e aplicar o percentual de CADA
  // UMA sobre o TOTAL dela (não venda a venda, nem sobre o agregado geral de todas juntas).
  // Isso garante duas coisas ao mesmo tempo:
  // 1) Com filtro de uma única revendedora, o resultado bate CENTAVO A CENTAVO com o Portal da
  //    Revendedora (que sempre divide sobre o total de uma revendedora só) — dividir venda a venda
  //    e depois somar as partes arredondadas individualmente pode fechar 1-2 centavos diferente.
  // 2) Com filtro "todas as revendedoras" e percentuais de divisão diferentes entre elas, nunca
  //    aplica o percentual de uma sobre o lucro de outra.
  const gruposPorRevendedora = new Map()
  for (const v of vendasDetalhadas) {
    const chave = String(v.revendedora_id)
    if (!gruposPorRevendedora.has(chave)) {
      gruposPorRevendedora.set(chave, {
        vendaLiquida: 0,
        custoAcerto: 0,
        comissao: 0,
        custoReal: 0,
        freteOperacional: 0,
        percRevendedora: v.percRevendedora
      })
    }
    const g = gruposPorRevendedora.get(chave)
    g.vendaLiquida += v.vendaLiquida
    g.custoAcerto += v.custoAcerto
    g.comissao += v.comissao
    g.custoReal += v.custoReal
    g.freteOperacional += v.freteOperacional
  }

  for (const g of gruposPorRevendedora.values()) {
    const lucroComercialRev = Number((g.vendaLiquida - g.custoAcerto - g.comissao).toFixed(2))
    const divisaoRev = calcularDivisaoLucro(lucroComercialRev, g.percRevendedora)
    totalParteRevendedoraLucro += divisaoRev.parteRevendedora
    totalParteBazarLucro += divisaoRev.parteBazar
    totalDevidoBazar += Number((g.custoAcerto + divisaoRev.parteBazar).toFixed(2))

    const lucroOperacionalRealRev = Number((g.vendaLiquida - g.custoReal - g.freteOperacional - g.comissao).toFixed(2))
    const parteBazarLucroRealRev = Number((lucroOperacionalRealRev - divisaoRev.parteRevendedora).toFixed(2))
    totalParteRevendedoraLucroReal += divisaoRev.parteRevendedora
    totalParteBazarLucroReal += parteBazarLucroRealRev
  }

  totalVendidoBruto = Number(totalVendidoBruto.toFixed(2))
  totalDescontos = Number(totalDescontos.toFixed(2))
  totalVendaLiquida = Number(totalVendaLiquida.toFixed(2))
  totalComissao = Number(totalComissao.toFixed(2))
  totalCustoRepasse = Number(totalCustoRepasse.toFixed(2))
  totalCustoAcerto = Number(totalCustoAcerto.toFixed(2))
  totalCustoReal = Number(totalCustoReal.toFixed(2))
  totalFreteOperacional = Number(totalFreteOperacional.toFixed(2))

  // Revendedora ativa selecionada (ou padrão das vendas/cadastro)
  let revAtiva = (Array.isArray(revendedoras) ? revendedoras : []).find(
    (r) => Number(r.id) === Number(filtroRevendedoraId)
  )
  if (!revAtiva && vendasFiltradas.length > 0) {
    const revIdFromSale = vendasFiltradas[0].revendedora_id || (Array.isArray(remessas) ? remessas.find((r) => Number(r.id) === Number(vendasFiltradas[0].remessa_id))?.revendedora_id : null)
    if (revIdFromSale) {
      revAtiva = (Array.isArray(revendedoras) ? revendedoras : []).find((r) => Number(r.id) === Number(revIdFromSale))
    }
  }
  if (!revAtiva && Array.isArray(revendedoras) && revendedoras.length > 0) {
    revAtiva = revendedoras.find((r) => r.percentual_lucro_revendedora != null && Number(r.percentual_lucro_revendedora) > 0) || revendedoras[0]
  }

  let percRevGeral = 0
  if (revAtiva && revAtiva.percentual_lucro_revendedora != null && !isNaN(Number(revAtiva.percentual_lucro_revendedora))) {
    percRevGeral = Number(revAtiva.percentual_lucro_revendedora)
  } else if (revAtiva?.usa_divisao_lucro) {
    percRevGeral = 40
  }
  const percBazarGeral = Math.max(0, 100 - percRevGeral)
  const usaDivisaoGeral = percRevGeral > 0 || Boolean(revAtiva?.usa_divisao_lucro)

  // 1. Resultado Consolidado (Comercial): soma das participações já calculadas VENDA A VENDA
  // (cada uma respeitando o percentual individual da sua própria revendedora — ver totalParteRevendedoraLucro
  // acumulado no loop acima). NUNCA recalcular a divisão sobre o agregado com um único percentual "geral":
  // com o filtro "todas as revendedoras" e percentuais de divisão de lucro diferentes entre elas, isso
  // aplicaria o percentual de uma revendedora só sobre o lucro de todas, dando um total errado.
  const totalLucroComercial = Number((totalVendaLiquida - totalCustoAcerto - totalComissao).toFixed(2))
  const totalParteRevendedoraLucroComercial = Number(totalParteRevendedoraLucro.toFixed(2))
  const totalParteBazarLucroComercial = Number(totalParteBazarLucro.toFixed(2))
  totalDevidoBazar = Number(totalDevidoBazar.toFixed(2))

  // 2. Divisão Econômica Real (Custo Real): idem, soma das participações já calculadas venda a venda.
  totalParteRevendedoraLucroReal = Number(totalParteRevendedoraLucroReal.toFixed(2))
  totalLucroOperacionalReal = Number((totalVendaLiquida - totalCustoReal - totalFreteOperacional - totalComissao).toFixed(2))
  totalParteBazarLucroReal = Number(totalParteBazarLucroReal.toFixed(2))

  totalLucroLiquido = totalParteBazarLucroReal
  totalParteRevendedoraLucro = totalParteRevendedoraLucroReal
  totalParteBazarLucro = totalParteBazarLucroReal

  const totalEconomicoRevendedora = Number((totalComissao + totalParteRevendedoraLucroReal).toFixed(2))
  const totalResultadoBazar = Number((totalCustoAcerto + totalParteBazarLucroComercial).toFixed(2))

  // 4. Filtrar Pagamentos
  let pagamentosFiltrados = Array.isArray(pagamentos) ? pagamentos : []

  if (filtroRevendedoraId !== 'todas' && filtroRevendedoraId) {
    pagamentosFiltrados = pagamentosFiltrados.filter(
      (p) => Number(p.revendedora_id) === Number(filtroRevendedoraId)
    )
  }

  if (filtroRemessaId !== 'todas' && filtroRemessaId) {
    pagamentosFiltrados = pagamentosFiltrados.filter(
      (p) => Number(p.remessa_id) === Number(filtroRemessaId)
    )
  }

  // Filtro de período nos pagamentos (mesma comparação por texto de data usada nas vendas acima,
  // para nunca divergir do Portal da Revendedora por causa de fuso horário).
  if (filtroPeriodo === 'mes_atual') {
    pagamentosFiltrados = pagamentosFiltrados.filter((p) =>
      String(p.data_pagamento || p.criado_em || '').slice(0, 10).startsWith(anoMesAtualStr)
    )
  } else if (filtroPeriodo === 'mes_anterior') {
    pagamentosFiltrados = pagamentosFiltrados.filter((p) =>
      String(p.data_pagamento || p.criado_em || '').slice(0, 10).startsWith(anoMesAnteriorStr)
    )
  } else if (filtroPeriodo === 'personalizado') {
    if (dataInicioCustom) {
      pagamentosFiltrados = pagamentosFiltrados.filter(
        (p) => String(p.data_pagamento || p.criado_em || '').slice(0, 10) >= dataInicioCustom
      )
    }
    if (dataFimCustom) {
      pagamentosFiltrados = pagamentosFiltrados.filter(
        (p) => String(p.data_pagamento || p.criado_em || '').slice(0, 10) <= dataFimCustom
      )
    }
  }

  const pagamentosConfirmadosList = pagamentosFiltrados.filter(
    (p) => (p.status || 'CONFIRMADO') === 'CONFIRMADO'
  )
  const pagamentosAguardandoList = pagamentosFiltrados.filter(
    (p) => p.status === 'AGUARDANDO_CONFIRMACAO'
  )

  const totalPagoConfirmado = Number(
    pagamentosConfirmadosList
      .reduce((acc, p) => acc + Number(p.valor_confirmado != null ? p.valor_confirmado : p.valor || 0), 0)
      .toFixed(2)
  )

  const totalPagamentoAguardando = Number(
    pagamentosAguardandoList
      .reduce((acc, p) => acc + Number(p.valor_informado != null ? p.valor_informado : p.valor || 0), 0)
      .toFixed(2)
  )

  const saldoPendente = Math.max(0, Number((totalDevidoBazar - totalPagoConfirmado).toFixed(2)))

  let statusAcerto = 'PAGO'
  if (saldoPendente > 0.01) {
    statusAcerto = totalPagoConfirmado > 0 ? 'PARCIALMENTE PAGO' : 'EM ABERTO'
  }

  // Margens Econômicas Reais
  const margemOperacionalReal = totalVendaLiquida > 0 ? (totalLucroOperacionalReal / totalVendaLiquida) * 100 : 0
  const margemRealBazar = totalVendaLiquida > 0 ? (totalParteBazarLucroReal / totalVendaLiquida) * 100 : 0
  const margemBruta = totalVendaLiquida > 0 ? ((totalVendaLiquida - totalCustoReal) / totalVendaLiquida) * 100 : 0
  const margemAposComissao = totalVendaLiquida > 0 ? ((totalVendaLiquida - totalCustoReal - totalComissao) / totalVendaLiquida) * 100 : 0

  // Indicadores Extras
  const ticketMedio = vendasDetalhadas.length > 0 ? totalVendaLiquida / vendasDetalhadas.length : 0
  const precoMedioPeca = totalPecasVendidas > 0 ? totalVendaLiquida / totalPecasVendidas : 0
  const descontoMedioPerc = totalVendidoBruto > 0 ? (totalDescontos / totalVendidoBruto) * 100 : 0

  // Objeto estruturado: 1. Resultado Consolidado Comercial
  const resultadoConsolidado = {
    totalVendas: totalVendaLiquida,
    totalComissao,
    // Custo usado no acerto (custo real das mercadorias, sem frete). Nome mantido por compatibilidade com a tela.
    custoRepasse: totalCustoAcerto,
    custoMercadorias: totalCustoAcerto,
    lucroLiquido: totalLucroComercial,
    usaDivisao: usaDivisaoGeral,
    percRevendedora: percRevGeral,
    percBazar: percBazarGeral,
    parteRevendedora: totalParteRevendedoraLucroComercial,
    parteBazar: totalParteBazarLucroComercial,
    totalEconomicoRevendedora: Number((totalComissao + totalParteRevendedoraLucroComercial).toFixed(2)),
    valorDevidoAoBazar: totalDevidoBazar,
    valorPago: totalPagoConfirmado,
    valorPagamentoAguardando: totalPagamentoAguardando,
    saldo: saldoPendente,
    status: statusAcerto,
    totalPecasVendidas
  }

  // Objeto estruturado: 2. Divisão do Resultado Econômico Real
  const divisaoEconomicaReal = {
    vendaLiquida: totalVendaLiquida,
    custoReal: totalCustoReal,
    freteOperacional: totalFreteOperacional,
    comissao: totalComissao,
    lucroOperacionalReal: totalLucroOperacionalReal,
    margemOperacional: margemOperacionalReal,
    usaDivisao: usaDivisaoGeral,
    percRevendedora: percRevGeral,
    percBazar: percBazarGeral,
    parteRevendedora: totalParteRevendedoraLucroReal,
    parteBazar: totalParteBazarLucroReal,
    lucroRealBazar: totalParteBazarLucroReal,
    margemRealBazar,
    custoRecuperado: totalCustoReal,
    totalRetidoBazar: Number((totalCustoReal + totalFreteOperacional + totalParteBazarLucroReal).toFixed(2))
  }

  return {
    vendasDetalhadas,
    totalVendidoBruto,
    totalDescontos,
    totalVendaLiquida,
    totalCustoReal,
    totalCustoRepasse,
    totalFreteOperacional,
    totalComissao,
    totalLucroLiquido,
    totalLucroOperacionalReal,
    totalParteRevendedoraLucro,
    totalParteBazarLucro,
    totalParteRevendedoraLucroReal,
    totalParteBazarLucroReal,
    totalEconomicoRevendedora,
    totalResultadoBazar,
    totalDevidoBazar,
    totalPagoConfirmado,
    totalPagamentoAguardando,
    saldoPendente,
    statusAcerto,
    margemBruta,
    margemAposComissao,
    margemOperacionalReal,
    margemBazar: margemRealBazar,
    margemRealBazar,
    ticketMedio,
    totalPecasVendidas,
    precoMedioPeca,
    descontoMedioPerc,
    pagamentosConfirmadosList,
    pagamentosAguardandoList,
    resultadoConsolidado,
    divisaoEconomicaReal
  }
}

/**
 * Detalha o resultado financeiro consolidado agrupado por Remessa.
 */
export function detalharResultadoPorRemessaAdmin({
  remessas = [],
  vendas = [],
  revendedoras = [],
  pagamentos = [],
  produtos = [],
  filtroRevendedoraId = 'todas'
}) {
  let remessasFiltradas = Array.isArray(remessas) ? remessas : []
  if (filtroRevendedoraId !== 'todas' && filtroRevendedoraId) {
    remessasFiltradas = remessasFiltradas.filter(
      (r) => Number(r.revendedora_id) === Number(filtroRevendedoraId)
    )
  }

  const vendasConfirmadas = (Array.isArray(vendas) ? vendas : []).filter(
    (v) => vendaContaNoFinanceiro(v)
  )
  const pagamentosConfirmados = (Array.isArray(pagamentos) ? pagamentos : []).filter(
    (p) => (p.status || 'CONFIRMADO') === 'CONFIRMADO'
  )

  return remessasFiltradas.map((remessa) => {
    const rev = (Array.isArray(revendedoras) ? revendedoras : []).find(
      (r) => Number(r.id) === Number(remessa.revendedora_id)
    )
    const itens = Array.isArray(remessa.itens) ? remessa.itens : []
    const totalPecasEnviadas = itens.reduce((acc, i) => acc + Number(i.quantidade_enviada || i.quantidade || 0), 0)

    const vendasDaRemessa = vendasConfirmadas.filter(
      (v) => Number(v.remessa_id) === Number(remessa.id)
    )

    const vendasDet = vendasDaRemessa.map((v) => detalharVendaFinanceiraAdmin(v, rev, remessas, produtos))

    let totalPecasVendidas = 0
    let vendaBruta = 0
    let desconto = 0
    let vendaLiquida = 0
    let custoReal = 0
    let comissao = 0
    let lucroLiquido = 0
    let parteRevendedora = 0
    let parteBazar = 0
    let valorDevido = 0

    for (const vd of vendasDet) {
      totalPecasVendidas += vd.quantidade
      vendaBruta += vd.vendaBruta
      desconto += vd.valorDesconto
      vendaLiquida += vd.vendaLiquida
      custoReal += vd.custoReal
      comissao += vd.comissao
      lucroLiquido += vd.lucroOperacao
      parteRevendedora += vd.parteRevendedoraLucro
      parteBazar += vd.parteBazarLucro
      valorDevido += vd.valorDevidoAoBazar
    }

    vendaBruta = Number(vendaBruta.toFixed(2))
    desconto = Number(desconto.toFixed(2))
    vendaLiquida = Number(vendaLiquida.toFixed(2))
    custoReal = Number(custoReal.toFixed(2))
    comissao = Number(comissao.toFixed(2))
    lucroLiquido = Number(lucroLiquido.toFixed(2))
    parteRevendedora = Number(parteRevendedora.toFixed(2))
    parteBazar = Number(parteBazar.toFixed(2))
    valorDevido = Number(valorDevido.toFixed(2))

    // Pagamentos vinculados à remessa
    const pagsRemessa = pagamentosConfirmados.filter(
      (p) => Number(p.remessa_id) === Number(remessa.id)
    )
    const valorPago = Number(
      pagsRemessa
        .reduce((acc, p) => acc + Number(p.valor_confirmado != null ? p.valor_confirmado : p.valor || 0), 0)
        .toFixed(2)
    )

    const saldo = Math.max(0, Number((valorDevido - valorPago).toFixed(2)))
    const margemBazar = vendaLiquida > 0 ? (parteBazar / vendaLiquida) * 100 : 0

    let statusFinanceiro = 'QUITADO'
    if (saldo > 0.01) {
      statusFinanceiro = valorPago > 0 ? 'PAGAMENTO PARCIAL' : 'EM ABERTO'
    }

    return {
      remessa_id: remessa.id,
      numero: remessa.numero || `REM-${String(remessa.id).padStart(6, '0')}`,
      revendedora_id: remessa.revendedora_id,
      revendedora_nome: remessa.revendedora_nome || rev?.nome || 'Revendedora',
      data_envio: remessa.data_envio || remessa.criado_em,
      status: remessa.status || 'Enviada',
      totalPecasEnviadas,
      totalPecasVendidas,
      vendaBruta,
      desconto,
      vendaLiquida,
      custoReal,
      comissao,
      lucroLiquido,
      parteRevendedora,
      parteBazar,
      margemBazar,
      valorDevido,
      valorPago,
      saldo,
      statusFinanceiro
    }
  })
}



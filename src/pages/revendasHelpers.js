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

export function calcularComissao(valorVendido, percentualComissao) {
  const valor = Number(valorVendido || 0)
  const perc = Number(percentualComissao || 0)
  if (valor <= 0 || perc <= 0) return 0
  return Number(((valor * perc) / 100).toFixed(2))
}

export function calcularValorLoja(valorVendido, percentualComissao) {
  const valor = Number(valorVendido || 0)
  const comissao = calcularComissao(valor, percentualComissao)
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

  const vendasRev = Array.isArray(vendas)
    ? vendas.filter((v) => Number(v.revendedora_id) === Number(revendedora.id))
    : []

  let totalVendidoBruto = 0
  let totalComissao = 0
  let totalDevidoLoja = 0

  for (const venda of vendasRev) {
    totalVendidoBruto += Number(venda.valor_total_bruto || 0)
    totalComissao += Number(venda.valor_comissao || 0)
    totalDevidoLoja += Number(venda.valor_loja || 0)
  }

  const pagamentosRev = Array.isArray(pagamentos)
    ? pagamentos.filter((p) => Number(p.revendedora_id) === Number(revendedora.id))
    : []

  let totalPago = 0
  for (const pag of pagamentosRev) {
    totalPago += Number(pag.valor || 0)
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

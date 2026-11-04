import { obterDataLocalHoje } from './dataLocal.js'

/**
 * Data de recebimento da venda (desde 04/11/2026).
 *
 * A revendedora pode informar o dia em que o dinheiro cai (ex.: marketplace que repassa em
 * alguns dias). A peça sai do estoque na hora, mas a venda só entra nos valores financeiros
 * (vendido, comissão, acerto, devido ao bazar) a partir desse dia. Sem data = conta na data da venda.
 */

function soData(valor) {
  return String(valor || '').slice(0, 10)
}

/** Data usada para encaixar a venda no período do acerto ("AAAA-MM-DD"). */
export function dataContabilVenda(venda) {
  return soData(venda?.data_recebimento || venda?.data_venda || venda?.criado_em)
}

/** true enquanto o dinheiro da venda ainda não caiu (data de recebimento no futuro). */
export function vendaAguardandoRecebimento(venda, hoje = obterDataLocalHoje()) {
  const data = soData(venda?.data_recebimento)
  return Boolean(data) && data > hoje
}

/** Venda confirmada cujo dinheiro já caiu: é a que soma no financeiro. */
export function vendaContaNoFinanceiro(venda, hoje = obterDataLocalHoje()) {
  const status = String(venda?.status || 'CONFIRMADA').toUpperCase()
  return status === 'CONFIRMADA' && !vendaAguardandoRecebimento(venda, hoje)
}

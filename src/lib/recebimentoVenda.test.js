import test from 'node:test'
import assert from 'node:assert/strict'
import { dataContabilVenda, vendaAguardandoRecebimento, vendaContaNoFinanceiro } from './recebimentoVenda.js'
import { calcularConsolidacaoFinanceira, filtrarVendasConsolidacao, calcularResumoDashboard } from '../pages/portal-revendedora/portalHelpers.js'
import { calcularPainelFinanceiroAdmin } from '../pages/revendasHelpers.js'

const HOJE = '2026-11-04'

test('venda sem data de recebimento conta normalmente na data da venda', () => {
  const v = { status: 'CONFIRMADA', data_venda: '2026-11-04T00:00:00+00:00' }
  assert.equal(vendaAguardandoRecebimento(v, HOJE), false)
  assert.equal(vendaContaNoFinanceiro(v, HOJE), true)
  assert.equal(dataContabilVenda(v), '2026-11-04')
})

test('venda com recebimento futuro só conta quando o dia chega', () => {
  const v = { status: 'CONFIRMADA', data_venda: '2026-11-04', data_recebimento: '2026-11-08' }
  assert.equal(vendaContaNoFinanceiro(v, '2026-11-04'), false)
  assert.equal(vendaContaNoFinanceiro(v, '2026-11-07'), false)
  assert.equal(vendaContaNoFinanceiro(v, '2026-11-08'), true)
  assert.equal(dataContabilVenda(v), '2026-11-08')
})

test('venda cancelada nunca conta, mesmo com data de recebimento', () => {
  const v = { status: 'CANCELADA', data_venda: '2026-10-01', data_recebimento: '2026-10-02' }
  assert.equal(vendaContaNoFinanceiro(v, HOJE), false)
})

test('portal: acerto, filtro de período e painel ignoram venda a receber', () => {
  const vendas = [
    { id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 100, valor_comissao: 10, valor_loja: 90, data_venda: '2026-11-01' },
    { id: 2, status: 'CONFIRMADA', quantidade: 1, total_venda: 200, valor_comissao: 20, valor_loja: 180, data_venda: '2026-11-03', data_recebimento: '2999-01-01' }
  ]
  const cons = calcularConsolidacaoFinanceira(vendas, { usa_divisao_lucro: false }, [])
  assert.equal(cons.quantidadeVendasConfirmadas, 1)
  assert.equal(filtrarVendasConsolidacao({ vendas }).length, 1)
  const resumo = calcularResumoDashboard([], vendas, [], { usa_divisao_lucro: false })
  assert.equal(resumo.totalVendido, 100)
  assert.equal(resumo.vendasAReceberQtd, 1)
  assert.equal(resumo.valorAReceber, 200)
  assert.equal(resumo.vendidas, 2) // a peça já saiu do estoque
})

test('portal: venda já recebida entra no período do dia do recebimento', () => {
  const vendas = [
    { id: 1, status: 'CONFIRMADA', quantidade: 1, total_venda: 100, data_venda: '2026-10-14', data_recebimento: '2026-10-18' }
  ]
  assert.equal(filtrarVendasConsolidacao({ vendas, periodo: 'personalizado', dataInicio: '2026-10-01', dataFim: '2026-10-15' }).length, 0)
  assert.equal(filtrarVendasConsolidacao({ vendas, periodo: 'personalizado', dataInicio: '2026-10-16', dataFim: '2026-10-31' }).length, 1)
})

test('admin: painel financeiro ignora venda a receber e usa a data do recebimento no período', () => {
  const base = { revendedora_id: 1, remessa_id: 1, status: 'CONFIRMADA', quantidade: 1, valor_repasse_unitario: 50, valor_comissao: 10 }
  const vendas = [
    { ...base, id: 1, total_venda: 100, data_venda: '2026-10-10' },
    { ...base, id: 2, total_venda: 100, data_venda: '2026-10-14', data_recebimento: '2026-10-18' },
    { ...base, id: 3, total_venda: 100, data_venda: '2026-10-14', data_recebimento: '2999-01-01' }
  ]
  const painel = calcularPainelFinanceiroAdmin({
    vendas, revendedoras: [{ id: 1, nome: 'R' }], remessas: [], filtroPeriodo: 'personalizado', dataInicioCustom: '2026-10-01', dataFimCustom: '2026-10-15'
  })
  assert.deepEqual(painel.vendasDetalhadas.map((v) => v.id), [1])
  const painel2 = calcularPainelFinanceiroAdmin({ vendas, revendedoras: [{ id: 1, nome: 'R' }], remessas: [] })
  assert.deepEqual(painel2.vendasDetalhadas.map((v) => v.id).sort(), [1, 2])
})

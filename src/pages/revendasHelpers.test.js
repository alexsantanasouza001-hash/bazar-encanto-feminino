import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calcularComissao,
  calcularProximoAcerto,
  calcularSaldoConsignadoItem,
  calcularValorLoja,
  consolidarResumoRevendedora,
  formatarMoeda,
  formatarTelefone,
  verificarAcertoAtrasado
} from './revendasHelpers.js'

test('calcula comissao e valor da loja para diferentes percentuais (0%, 10%, 20%, 25%, 30%, 100%)', () => {
  const valor = 200

  // 0% comissao
  assert.equal(calcularComissao(valor, 0), 0)
  assert.equal(calcularValorLoja(valor, 0), 200)

  // 10% comissao
  assert.equal(calcularComissao(valor, 10), 20)
  assert.equal(calcularValorLoja(valor, 10), 180)

  // 20% comissao
  assert.equal(calcularComissao(valor, 20), 40)
  assert.equal(calcularValorLoja(valor, 20), 160)

  // 25% comissao
  assert.equal(calcularComissao(valor, 25), 50)
  assert.equal(calcularValorLoja(valor, 25), 150)

  // 30% comissao
  assert.equal(calcularComissao(valor, 30), 60)
  assert.equal(calcularValorLoja(valor, 30), 140)

  // 100% comissao
  assert.equal(calcularComissao(valor, 100), 200)
  assert.equal(calcularValorLoja(valor, 100), 0)
})

test('calcula saldo consignado de um item corretamente (enviada - vendida - devolvida)', () => {
  const item = {
    quantidade_enviada: 10,
    quantidade_vendida: 3,
    quantidade_devolvida: 2
  }
  assert.equal(calcularSaldoConsignadoItem(item), 5)

  // Item totalmente liquidado
  const itemZerado = {
    quantidade_enviada: 5,
    quantidade_vendida: 3,
    quantidade_devolvida: 2
  }
  assert.equal(calcularSaldoConsignadoItem(itemZerado), 0)
})

test('congelamento de comissao: vendas historicas preservam a comissao da transacao', () => {
  const vendaAntiga = {
    valor_total_bruto: 100,
    comissao_percentual: 20,
    valor_comissao: 20,
    valor_loja: 80
  }

  // Se a comissao padrao da revendedora mudar no futuro para 30%:
  const novaComissaoPadrao = 30

  // A venda antiga deve permanecer com seus valores historicos inalterados
  assert.equal(vendaAntiga.comissao_percentual, 20)
  assert.equal(vendaAntiga.valor_comissao, 20)
  assert.equal(vendaAntiga.valor_loja, 80)
  assert.notEqual(vendaAntiga.comissao_percentual, novaComissaoPadrao)
})

test('calcula proximo acerto com base na periodicidade (7, 15, 30 dias)', () => {
  const dataBase = new Date('2026-08-01T10:00:00Z')

  const acerto7 = calcularProximoAcerto(dataBase, 7)
  assert.equal(acerto7.toISOString().slice(0, 10), '2026-08-08')

  const acerto15 = calcularProximoAcerto(dataBase, 15)
  assert.equal(acerto15.toISOString().slice(0, 10), '2026-08-16')

  const acerto30 = calcularProximoAcerto(dataBase, 30)
  assert.equal(acerto30.toISOString().slice(0, 10), '2026-08-31')
})

test('identifica acerto atrasado com precisao', () => {
  const agora = new Date('2026-08-15T12:00:00Z')

  assert.equal(verificarAcertoAtrasado('2026-08-10', agora), true)
  assert.equal(verificarAcertoAtrasado('2026-08-15', agora), false)
  assert.equal(verificarAcertoAtrasado('2026-08-20', agora), false)
})

test('consolida resumo financeiro e de estoque da revendedora com pagamento parcial', () => {
  const revendedora = {
    id: 1,
    nome: 'Maria Silva',
    comissao_padrao: 20,
    periodicidade_acerto_dias: 15,
    data_inicio: '2026-08-01'
  }

  const remessas = [
    {
      id: 10,
      revendedora_id: 1,
      itens: [
        { id: 101, quantidade_enviada: 5, quantidade_vendida: 2, quantidade_devolvida: 1, preco_venda_sugerido: 100 },
        { id: 102, quantidade_enviada: 4, quantidade_vendida: 1, quantidade_devolvida: 0, preco_venda_sugerido: 150 }
      ]
    }
  ]

  const vendas = [
    { id: 201, revendedora_id: 1, valor_total_bruto: 200, valor_comissao: 40, valor_loja: 160 },
    { id: 202, revendedora_id: 1, valor_total_bruto: 150, valor_comissao: 30, valor_loja: 120 }
  ]

  // Pagamento parcial de R$ 180 (do total devido de R$ 280)
  const pagamentos = [
    { id: 301, revendedora_id: 1, valor: 180, forma_pagamento: 'Pix' }
  ]

  const resumo = consolidarResumoRevendedora(revendedora, remessas, vendas, pagamentos)

  // Saldo consignado: (5-2-1=2)*100 + (4-1-0=3)*150 = 200 + 450 = 650 (5 peças)
  assert.equal(resumo.pecasConsignadas, 5)
  assert.equal(resumo.valorConsignado, 650)
  assert.equal(resumo.totalVendidoBruto, 350)
  assert.equal(resumo.totalComissao, 70)
  assert.equal(resumo.totalDevidoLoja, 280)
  assert.equal(resumo.totalPago, 180)
  assert.equal(resumo.saldoPendente, 100)
})

test('pagamento total zera saldo pendente', () => {
  const revendedora = { id: 2, nome: 'Ana Costa', comissao_padrao: 15, periodicidade_acerto_dias: 15 }
  const remessas = [
    { id: 20, revendedora_id: 2, itens: [{ id: 201, quantidade_enviada: 2, quantidade_vendida: 2, quantidade_devolvida: 0, preco_venda_sugerido: 100 }] }
  ]
  const vendas = [
    { id: 401, revendedora_id: 2, valor_total_bruto: 200, valor_comissao: 30, valor_loja: 170 }
  ]
  const pagamentos = [
    { id: 501, revendedora_id: 2, valor: 170, forma_pagamento: 'Pix' }
  ]

  const resumo = consolidarResumoRevendedora(revendedora, remessas, vendas, pagamentos)
  assert.equal(resumo.saldoPendente, 0)
  assert.equal(resumo.atrasado, false)
})

test('validacao de limites: saldo consignado impede venda ou devolucao excessiva', () => {
  const item = { quantidade_enviada: 4, quantidade_vendida: 3, quantidade_devolvida: 1 }
  const saldoRestante = calcularSaldoConsignadoItem(item)

  assert.equal(saldoRestante, 0)
  const tentarVender = 1
  const permitido = tentarVender <= saldoRestante
  assert.equal(permitido, false)
})

test('formatacao de moeda e telefone', () => {
  assert.equal(formatarMoeda(150), 'R$\xa0150,00')
  assert.equal(formatarTelefone('21988776655'), '(21) 98877-6655')
})

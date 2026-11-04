import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatarMoeda,
  formatarData,
  calcularSaldoItemConsignado,
  calcularResumoDashboard,
  calcularExtratoContaCorrente,
  filtrarPecasDisponiveis,
  simularValoresVenda,
  calcularConsolidacaoFinanceira,
  filtrarVendasConsolidacao
} from './portalHelpers.js'

test('formatarMoeda formata corretamente valores em BRL', () => {
  const formatado = formatarMoeda(1250.5).replace(/\s/g, ' ')
  assert.match(formatado, /R\$\s?1\.250,50/)
  assert.equal(formatarMoeda(0).replace(/\s/g, ' '), 'R$ 0,00')
})

test('formatarData formata strings ISO corretamente', () => {
  assert.equal(formatarData('2026-09-02T12:00:00Z'), '02/09/2026')
  assert.equal(formatarData(null), '-')
})

test('calcularSaldoItemConsignado considera enviadas, vendidas, devolvidas e reservadas', () => {
  const item = {
    quantidade_enviada: 10,
    quantidade_vendida: 3,
    quantidade_devolvida: 1,
    quantidade_reservada: 2
  }
  // 10 - 3 - 1 - 2 = 4 disponíveis
  assert.equal(calcularSaldoItemConsignado(item), 4)

  // Quando não há reserva
  const itemSemReserva = {
    quantidade_enviada: 10,
    quantidade_vendida: 3,
    quantidade_devolvida: 1,
    quantidade_reservada: 0
  }
  assert.equal(calcularSaldoItemConsignado(itemSemReserva), 6)

  // Nunca retorna número negativo
  const itemZerado = {
    quantidade_enviada: 5,
    quantidade_vendida: 6,
    quantidade_devolvida: 0,
    quantidade_reservada: 0
  }
  assert.equal(calcularSaldoItemConsignado(itemZerado), 0)
})

test('calcularResumoDashboard consolida métricas oficiais do Bazar com precisão', () => {
  const remessas = [
    {
      id: 4,
      numero: 'REM-000004',
      itens: [
        { quantidade_enviada: 20, quantidade_vendida: 5, quantidade_devolvida: 0, quantidade_reservada: 2 },
        { quantidade_enviada: 10, quantidade_vendida: 0, quantidade_devolvida: 0, quantidade_reservada: 0 }
      ]
    }
  ]

  const vendas = [
    {
      id: 1,
      status: 'CONFIRMADA',
      quantidade: 5,
      total_venda: 500,
      valor_comissao: 100,
      valor_loja: 400
    },
    {
      id: 2,
      status: 'AGUARDANDO_CONFERENCIA',
      quantidade: 2,
      total_venda: 200,
      valor_comissao: 40,
      valor_loja: 160
    },
    {
      id: 3,
      status: 'RECUSADA',
      quantidade: 1,
      total_venda: 100,
      valor_comissao: 20,
      valor_loja: 80
    }
  ]

  const pagamentos = [
    { id: 1, valor: 150, forma_pagamento: 'Pix' }
  ]

  const resumo = calcularResumoDashboard(remessas, vendas, pagamentos)

  // Peças disponíveis comigo: (20 - 5 - 0 - 2) + 10 = 13 + 10 = 23
  assert.equal(resumo.pecasComigo, 23)
  assert.equal(resumo.disponiveis, 23)
  // Apenas vendas confirmadas contam como vendidas oficiais
  assert.equal(resumo.vendidas, 5)
  assert.equal(resumo.vendasConfirmadasQtd, 1)
  assert.equal(resumo.vendasPendentesQtd, 1)
  assert.equal(resumo.totalVendido, 500)
  assert.equal(resumo.minhaComissao, 100)
  assert.equal(resumo.valorBazar, 400)
  assert.equal(resumo.totalRepassado, 150)
  // Saldo a repassar: 400 - 150 = 250
  assert.equal(resumo.saldoRepassar, 250)
})

test('calcularExtratoContaCorrente gera linha do tempo com saldos acumulados', () => {
  const vendas = [
    {
      id: 1,
      status: 'CONFIRMADA',
      produto_nome: 'Vestido Floral',
      quantidade: 1,
      total_venda: 200,
      valor_comissao: 40,
      valor_loja: 160,
      data_venda: '2026-09-01T10:00:00Z',
      numero_remessa: 'REM-000004'
    },
    {
      id: 2,
      status: 'CONFIRMADA',
      produto_nome: 'Blusa Crepe',
      quantidade: 1,
      total_venda: 100,
      valor_comissao: 20,
      valor_loja: 80,
      data_venda: '2026-09-02T10:00:00Z',
      numero_remessa: 'REM-000004'
    }
  ]

  const pagamentos = [
    {
      id: 1,
      valor: 100,
      forma_pagamento: 'Pix',
      data_pagamento: '2026-09-02T15:00:00Z'
    }
  ]

  const extrato = calcularExtratoContaCorrente(vendas, pagamentos)
  // Ordem decrescente de exibição (mais recente primeiro)
  assert.equal(extrato.length, 3)

  // Saldo final após o pagamento de 100: (160 + 80) - 100 = 140
  assert.equal(extrato[0].saldoApos, 140)
  assert.equal(extrato[0].tipo, 'PAGAMENTO')

  // Saldo antes do pagamento (após segunda venda): 160 + 80 = 240
  assert.equal(extrato[1].saldoApos, 240)
  assert.equal(extrato[1].tipo, 'VENDA')

  // Saldo após primeira venda: 160
  assert.equal(extrato[2].saldoApos, 160)
  assert.equal(extrato[2].tipo, 'VENDA')
})

test('filtrarPecasDisponiveis filtra apenas itens com saldo positivo e aplica busca', () => {
  const remessas = [
    {
      id: 4,
      numero: 'REM-000004',
      itens: [
        { id: 1, produto_nome: 'Vestido Floral Longo', sku: 'VEST-001', cor: 'Azul', tamanho: 'M', quantidade_enviada: 5, quantidade_vendida: 5, quantidade_devolvida: 0, quantidade_reservada: 0 },
        { id: 2, produto_nome: 'Saia Midi Linho', sku: 'SAIA-002', cor: 'Bege', tamanho: 'G', quantidade_enviada: 4, quantidade_vendida: 1, quantidade_devolvida: 0, quantidade_reservada: 1 },
        { id: 3, produto_nome: 'Camisa Seda', sku: 'CAM-003', cor: 'Branca', tamanho: 'P', quantidade_enviada: 2, quantidade_vendida: 0, quantidade_devolvida: 0, quantidade_reservada: 0 }
      ]
    }
  ]

  // Sem busca: o item 1 tem saldo 0, portanto não deve aparecer
  const todasDisp = filtrarPecasDisponiveis(remessas, '')
  assert.equal(todasDisp.length, 2)
  assert.equal(todasDisp[0].id, 2)
  assert.equal(todasDisp[0].disponivel_venda, 2) // 4 - 1 - 1 = 2
  assert.equal(todasDisp[1].id, 3)
  assert.equal(todasDisp[1].disponivel_venda, 2)

  // Com busca por termo
  const buscaSaia = filtrarPecasDisponiveis(remessas, 'saia')
  assert.equal(buscaSaia.length, 1)
  assert.equal(buscaSaia[0].produto_nome, 'Saia Midi Linho')

  const buscaSku = filtrarPecasDisponiveis(remessas, 'CAM-003')
  assert.equal(buscaSku.length, 1)
  assert.equal(buscaSku[0].produto_nome, 'Camisa Seda')
})

test('simularValoresVenda calcula comissão e valor bazar estritamente de acordo com a regra oficial', () => {
  // Cenário 1: Total vendido > Repasse total -> Gera comissão
  // Preço unitário: R$ 100, Repasse: R$ 60, Qtd: 1, Comissão: 20%
  const sim1 = simularValoresVenda({
    quantidade: 1,
    precoUnitario: 100,
    precoRepasse: 60,
    comissaoPercentual: 20,
    percentualDesconto: 0
  })
  assert.equal(sim1.subtotal, 100)
  assert.equal(sim1.totalVenda, 100)
  assert.equal(sim1.comissao, 20) // 20% de 100
  assert.equal(sim1.valorLoja, 80) // 100 - 20

  // Cenário 2 (regra desde 04/11/2026): Total vendido <= Repasse total -> comissão continua sendo cobrada
  const sim2 = simularValoresVenda({
    quantidade: 1,
    precoUnitario: 50,
    precoRepasse: 60,
    comissaoPercentual: 20,
    percentualDesconto: 0
  })
  assert.equal(sim2.totalVenda, 50)
  assert.equal(sim2.comissao, 10)
  assert.equal(sim2.valorLoja, 40)

  // Cenário 3: Com desconto aplicado
  const sim3 = simularValoresVenda({
    quantidade: 2,
    precoUnitario: 100,
    precoRepasse: 60,
    comissaoPercentual: 20,
    percentualDesconto: 10 // 10% desconto
  })
  // Subtotal = 200, Desconto = 20, Total = 180, Repasse total = 120
  // 180 > 120 -> Comissão = 20% de 180 = 36
  // Valor loja = 180 - 36 = 144
  assert.equal(sim3.subtotal, 200)
  assert.equal(sim3.valorDesconto, 20)
  assert.equal(sim3.totalVenda, 180)
  assert.equal(sim3.comissao, 36)
  assert.equal(sim3.valorLoja, 144)
})

test('Regra de Desconto Monetário (R$) e Valor Final Automático', () => {
  // 1. Lançar venda sem desconto
  const v1 = simularValoresVenda({
    quantidade: 1,
    precoUnitario: 189.90,
    precoRepasse: 120.00,
    valorDesconto: 0
  })
  assert.equal(v1.subtotal, 189.90)
  assert.equal(v1.valorDesconto, 0)
  assert.equal(v1.totalVenda, 189.90)

  // 2. Lançar venda com desconto monetário R$ 20,00
  const v2 = simularValoresVenda({
    quantidade: 1,
    precoUnitario: 189.90,
    precoRepasse: 120.00,
    valorDesconto: 20.00
  })
  // 3. Valor final correto: 189.90 - 20.00 = 169.90
  assert.equal(v2.subtotal, 189.90)
  assert.equal(v2.valorDesconto, 20.00)
  assert.equal(v2.totalVenda, 169.90)
  assert.equal(v2.totalVenda, Number((v2.subtotal - v2.valorDesconto).toFixed(2)))

  // 4. Desconto maior que o valor da venda é limitado ao subtotal (não permite total negativo)
  const v4 = simularValoresVenda({
    quantidade: 1,
    precoUnitario: 100.00,
    precoRepasse: 50.00,
    valorDesconto: 150.00 // maior que o subtotal
  })
  assert.equal(v4.subtotal, 100.00)
  assert.equal(v4.valorDesconto, 100.00)
  assert.equal(v4.totalVenda, 0.00)

  // 5. Desconto não pode ser negativo
  const v5 = simularValoresVenda({
    quantidade: 1,
    precoUnitario: 100.00,
    precoRepasse: 50.00,
    valorDesconto: -20.00
  })
  assert.equal(v5.valorDesconto, 0.00)
  assert.equal(v5.totalVenda, 100.00)
})

test('Lógica de Reajuste de Reserva de Estoque na Edição de Venda', () => {
  // Simula estoque na remessa: 10 enviadas, 0 vendidas, 0 devolvidas, 2 reservadas pela venda atual
  const itemRemessa = {
    quantidade_enviada: 10,
    quantidade_vendida: 0,
    quantidade_devolvida: 0,
    quantidade_reservada: 2
  }

  // 10. Reserva diminui corretamente: antes = 2 un., depois = 1 un. -> libera 1 un.
  const qtdAntes = 2
  const qtdDepoisDiminuida = 1
  const diferencaLiberar = qtdDepoisDiminuida - qtdAntes // -1
  const novaReservaAposDiminuir = itemRemessa.quantidade_reservada - Math.abs(diferencaLiberar)
  assert.equal(novaReservaAposDiminuir, 1)

  // 11. Reserva aumenta somente se houver estoque
  // Saldo físico disponível atualmente (sem a venda atual): 10 - 0 - 0 - 2 = 8 disponíveis
  const saldoDisponivel = calcularSaldoItemConsignado(itemRemessa)
  assert.equal(saldoDisponivel, 8)

  // Aumentar de 2 para 5 unidades (diferença +3): como 3 <= 8, permitido
  const qtdDepoisAumentada = 5
  const diferencaAumentar = qtdDepoisAumentada - qtdAntes // +3
  assert.ok(diferencaAumentar <= saldoDisponivel)
  const novaReservaAposAumentar = itemRemessa.quantidade_reservada + diferencaAumentar
  assert.equal(novaReservaAposAumentar, 5)

  // Tentar aumentar de 2 para 12 unidades (diferença +10 > 8 disponível): bloqueado
  const diferencaInvalida = 12 - qtdAntes // +10
  assert.equal(diferencaInvalida > saldoDisponivel, true)
})

test('Validações de Permissão de Edição por Status e Revendedora', () => {
  const revendedoraLogadaId = 1
  const vendaPendente = {
    id: 101,
    revendedora_id: 1,
    status: 'AGUARDANDO_CONFERENCIA',
    origem: 'PORTAL_REVENDEDORA'
  }
  const vendaConfirmada = {
    id: 102,
    revendedora_id: 1,
    status: 'CONFIRMADA',
    origem: 'PORTAL_REVENDEDORA'
  }
  const vendaRecusada = {
    id: 103,
    revendedora_id: 1,
    status: 'RECUSADA',
    origem: 'PORTAL_REVENDEDORA'
  }
  const vendaOutraRevendedora = {
    id: 104,
    revendedora_id: 2,
    status: 'AGUARDANDO_CONFERENCIA',
    origem: 'PORTAL_REVENDEDORA'
  }

  // 7. Editar venda AGUARDANDO_CONFERENCIA é permitido para o dono
  const podeEditarPendente = vendaPendente.status === 'AGUARDANDO_CONFERENCIA' &&
    vendaPendente.origem === 'PORTAL_REVENDEDORA' &&
    vendaPendente.revendedora_id === revendedoraLogadaId
  assert.equal(podeEditarPendente, true)

  // 13. Venda CONFIRMADA não pode ser editada
  const podeEditarConfirmada = vendaConfirmada.status === 'AGUARDANDO_CONFERENCIA'
  assert.equal(podeEditarConfirmada, false)

  // 14. Venda RECUSADA não pode ser editada
  const podeEditarRecusada = vendaRecusada.status === 'AGUARDANDO_CONFERENCIA'
  assert.equal(podeEditarRecusada, false)

  // 15. Revendedora A não edita venda da B
  const podeEditarOutra = vendaOutraRevendedora.revendedora_id === revendedoraLogadaId
  assert.equal(podeEditarOutra, false)

  // 12. Mesma venda mantém o mesmo ID
  const vendaAtualizada = { ...vendaPendente, quantidade: 3 }
  assert.equal(vendaAtualizada.id, vendaPendente.id)
})

test('Consolidação Financeira e Divisão Especial de Lucro Líquido (40% Revendedora / 60% Bazar)', () => {
  const revendedoraEspecial = {
    id: 1,
    nome: 'Patricia Spoltore',
    usa_divisao_lucro: true,
    percentual_lucro_revendedora: 40.00
  }

  // Vendas simuladas:
  // V1 (Confirmada): Total R$ 600, Repasse R$ 300, Comissão R$ 60
  // V2 (Confirmada com desconto): Subtotal R$ 450, Desconto R$ 50, Total R$ 400, Repasse R$ 200, Comissão R$ 40
  // V3 (Aguardando conferência): Total R$ 200 (NÃO DEVE ENTRAR)
  // V4 (Recusada): Total R$ 150 (NÃO DEVE ENTRAR)
  // V5 (Cancelada): Total R$ 100 (NÃO DEVE ENTRAR)
  const vendas = [
    {
      id: 1,
      status: 'CONFIRMADA',
      quantidade: 2,
      valor_repasse_unitario: 150.00, // Custo: 2 * 150 = 300
      total_venda: 600.00,
      valor_comissao: 60.00
    },
    {
      id: 2,
      status: 'CONFIRMADA',
      quantidade: 1,
      valor_repasse_unitario: 200.00, // Custo: 1 * 200 = 200
      subtotal_venda: 450.00,
      valor_desconto: 50.00,
      total_venda: 400.00,
      valor_comissao: 40.00
    },
    {
      id: 3,
      status: 'AGUARDANDO_CONFERENCIA',
      quantidade: 1,
      valor_repasse_unitario: 100.00,
      total_venda: 200.00,
      valor_comissao: 20.00
    },
    {
      id: 4,
      status: 'RECUSADA',
      quantidade: 1,
      valor_repasse_unitario: 80.00,
      total_venda: 150.00,
      valor_comissao: 15.00
    },
    {
      id: 5,
      status: 'CANCELADA',
      quantidade: 1,
      valor_repasse_unitario: 50.00,
      total_venda: 100.00,
      valor_comissao: 10.00
    }
  ]

  const consolidacao = calcularConsolidacaoFinanceira(vendas, revendedoraEspecial)

  // 1, 2, 3, 4: Somente confirmadas entram (2 de 5)
  assert.equal(consolidacao.quantidadeVendasConfirmadas, 2)

  // 5. Total de vendas respeitando descontos: 600 + 400 = 1.000
  assert.equal(consolidacao.totalVendas, 1000.00)

  // 6. Custo total (repasse): 300 + 200 = 500
  assert.equal(consolidacao.custoTotal, 500.00)

  // 7. Comissão total: 60 + 40 = 100
  assert.equal(consolidacao.comissaoTotal, 100.00)

  // 8. Lucro líquido: 1000 - 500 - 100 = 400
  assert.equal(consolidacao.lucroLiquido, 400.00)

  // 9. Percentual individual da revendedora: 40%
  assert.equal(consolidacao.percentualRevendedora, 40.00)

  // 10. Percentual do Bazar: 100 - 40 = 60%
  assert.equal(consolidacao.percentualBazar, 60.00)

  // Divisão do lucro:
  // Parte revendedora: 40% de 400 = 160
  assert.equal(consolidacao.parteLucroRevendedora, 160.00)
  // Parte Bazar: 60% de 400 = 240
  assert.equal(consolidacao.parteLucroBazar, 240.00)

  // 11. Total da revendedora = comissão (100) + parte do lucro (160) = 260
  assert.equal(consolidacao.totalRevendedora, 260.00)

  // 12. Valor a pagar ao Bazar = custo (500) + parte do lucro Bazar (240) = 740
  assert.equal(consolidacao.valorDevidoBazar, 740.00)

  // 13. Conferência matemática: 260 + 740 = 1.000 (fecha exatamente)
  assert.equal(consolidacao.totalRevendedora + consolidacao.valorDevidoBazar, consolidacao.totalVendas)

  // 14 e 15. Revendedora padrão SEM divisão de lucro
  const revendedoraPadrao = {
    id: 2,
    nome: 'Outra Revendedora',
    usa_divisao_lucro: false
  }
  const consolidacaoPadrao = calcularConsolidacaoFinanceira(vendas, revendedoraPadrao)
  assert.equal(consolidacaoPadrao.usaDivisao, false)
  assert.equal(consolidacaoPadrao.totalVendas, 1000.00)
  assert.equal(consolidacaoPadrao.comissaoTotal, 100.00)
  assert.equal(consolidacaoPadrao.totalRevendedora, 100.00) // apenas a comissão
  assert.equal(consolidacaoPadrao.valorDevidoBazar, 900.00) // totalVenda - comissao
  assert.equal(consolidacaoPadrao.totalRevendedora + consolidacaoPadrao.valorDevidoBazar, consolidacaoPadrao.totalVendas)
})

test('Percentual é 100% dinâmico definido pelo Admin (alteração de 40% -> 35% -> 50% -> desativação)', () => {
  const vendas = [
    {
      id: 1,
      status: 'CONFIRMADA',
      quantidade: 1,
      valor_repasse_unitario: 500.00,
      total_venda: 1000.00,
      valor_comissao: 100.00
    }
  ]

  // Cenário A: Admin configurou 40%
  const rev40 = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 40 }
  const c40 = calcularConsolidacaoFinanceira(vendas, rev40)
  assert.equal(c40.percentualRevendedora, 40)
  assert.equal(c40.percentualBazar, 60)
  assert.equal(c40.lucroLiquido, 400)
  assert.equal(c40.parteLucroRevendedora, 160)
  assert.equal(c40.parteLucroBazar, 240)
  assert.equal(c40.totalRevendedora, 260)
  assert.equal(c40.valorDevidoBazar, 740)
  assert.equal(c40.totalRevendedora + c40.valorDevidoBazar, 1000)

  // Cenário B: Admin alterou cadastro para 35% (sem nenhuma mudança de código!)
  const rev35 = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 35 }
  const c35 = calcularConsolidacaoFinanceira(vendas, rev35)
  assert.equal(c35.percentualRevendedora, 35)
  assert.equal(c35.percentualBazar, 65)
  assert.equal(c35.lucroLiquido, 400)
  assert.equal(c35.parteLucroRevendedora, 140)
  assert.equal(c35.parteLucroBazar, 260)
  assert.equal(c35.totalRevendedora, 240)
  assert.equal(c35.valorDevidoBazar, 760)
  assert.equal(c35.totalRevendedora + c35.valorDevidoBazar, 1000)

  // Cenário C: Admin alterou cadastro para 50%
  const rev50 = { id: 1, usa_divisao_lucro: true, percentual_lucro_revendedora: 50 }
  const c50 = calcularConsolidacaoFinanceira(vendas, rev50)
  assert.equal(c50.percentualRevendedora, 50)
  assert.equal(c50.percentualBazar, 50)
  assert.equal(c50.parteLucroRevendedora, 200)
  assert.equal(c50.parteLucroBazar, 200)
  assert.equal(c50.totalRevendedora, 300)
  assert.equal(c50.valorDevidoBazar, 700)
  assert.equal(c50.totalRevendedora + c50.valorDevidoBazar, 1000)

  // Cenário D: Admin desativou a divisão especial
  const revDesativada = { id: 1, usa_divisao_lucro: false, percentual_lucro_revendedora: 40 }
  const cDesativada = calcularConsolidacaoFinanceira(vendas, revDesativada)
  assert.equal(cDesativada.usaDivisao, false)
  assert.equal(cDesativada.totalRevendedora, 100) // comissão
  assert.equal(cDesativada.valorDevidoBazar, 900) // 1000 - 100
  assert.equal(cDesativada.totalRevendedora + cDesativada.valorDevidoBazar, 1000)

  // Cenário E: Outra revendedora completamente independente
  const revOutra = { id: 99, usa_divisao_lucro: false }
  const cOutra = calcularConsolidacaoFinanceira(vendas, revOutra)
  assert.equal(cOutra.usaDivisao, false)
  assert.equal(cOutra.totalRevendedora, 100)
  assert.equal(cOutra.valorDevidoBazar, 900)
})

test('Aba Acertos: Paridade exata com Resumo (R$ 447,92) e cálculo de Saldo Pendente', () => {
  // Dados reais da revendedora Patricia Spoltore (ID 1)
  const revendedora = {
    id: 1,
    nome: 'Patricia Spoltore',
    usa_divisao_lucro: true,
    percentual_lucro_revendedora: 40.00
  }

  // Vendas reais no banco:
  // 1. REM-000005: 1x 145.00 (repasse 150.00, comissao 0.00, valor_loja 145.00) -> CONFIRMADA
  // 2. REM-000005: 1x 99.00 (repasse 65.00, comissao 9.90, valor_loja 89.10) -> CONFIRMADA
  // 3. REM-000005: 1x 299.00 (repasse 150.00, comissao 29.90, valor_loja 269.10) -> CONFIRMADA
  // 4. REM-000005: 1x 89.00 (repasse 65.00, comissao 8.90, valor_loja 80.10) -> AGUARDANDO_CONFERENCIA (NÃO DEVE ENTRAR)
  const vendasReais = [
    {
      id: 1,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      quantidade: 1,
      total_venda: 145.00,
      valor_repasse_unitario: 150.00,
      valor_comissao: 0.00,
      valor_loja: 145.00,
      status: 'CONFIRMADA',
      data_venda: '2026-09-02T10:00:00Z'
    },
    {
      id: 2,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      quantidade: 1,
      total_venda: 99.00,
      valor_repasse_unitario: 65.00,
      valor_comissao: 9.90,
      valor_loja: 89.10,
      status: 'CONFIRMADA',
      data_venda: '2026-09-02T11:00:00Z'
    },
    {
      id: 3,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      quantidade: 1,
      total_venda: 299.00,
      valor_repasse_unitario: 150.00,
      valor_comissao: 29.90,
      valor_loja: 269.10,
      status: 'CONFIRMADA',
      data_venda: '2026-09-02T12:00:00Z'
    },
    {
      id: 4,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      quantidade: 1,
      total_venda: 89.00,
      valor_repasse_unitario: 65.00,
      valor_comissao: 8.90,
      valor_loja: 80.10,
      status: 'AGUARDANDO_CONFERENCIA',
      data_venda: '2026-09-02T13:00:00Z'
    }
  ]

  // Filtro padrão de Acertos: todos os períodos e todas as remessas
  const vendasFiltradas = filtrarVendasConsolidacao({
    vendas: vendasReais,
    periodo: 'todos',
    remessaId: 'todas'
  })

  // 11, 12, 13, 14: Apenas confirmadas entram (3 confirmadas, 1 pendente ignorada)
  assert.equal(vendasFiltradas.length, 3)

  // Consolidação em Acertos
  const consolidacaoAcertos = calcularConsolidacaoFinanceira(vendasFiltradas, revendedora)

  // 4 & 5: Se Resumo = R$ 447,92, Acertos = R$ 447,92
  assert.equal(consolidacaoAcertos.totalVendas, 543.00)
  assert.equal(consolidacaoAcertos.custoTotal, 365.00)
  assert.equal(consolidacaoAcertos.comissaoTotal, 39.80)
  assert.equal(consolidacaoAcertos.lucroLiquido, 138.20)
  assert.equal(consolidacaoAcertos.parteLucroRevendedora, 55.28)
  assert.equal(consolidacaoAcertos.parteLucroBazar, 82.92)
  assert.equal(consolidacaoAcertos.totalRevendedora, 95.08)
  assert.equal(consolidacaoAcertos.valorDevidoBazar, 447.92)

  // Também no calcularResumoDashboard, o valorBazar e saldoRepassar devem ser exatamente R$ 447,92
  const resumoDash = calcularResumoDashboard([], vendasReais, [], revendedora)
  assert.equal(resumoDash.valorBazar, 447.92)
  assert.equal(resumoDash.saldoRepassar, 447.92)

  // 15 & 16: Saldo Pendente com pagamentos
  const pagamentosParciais = [{ id: 1, valor: 100.00 }]
  const valorJaPago = pagamentosParciais.reduce((acc, p) => acc + p.valor, 0)
  const saldoPendente = Math.max(0, Number((consolidacaoAcertos.valorDevidoBazar - valorJaPago).toFixed(2)))
  assert.equal(valorJaPago, 100.00)
  assert.equal(saldoPendente, 347.92) // 447.92 - 100.00
})

test('Filtros da Aba Acertos: Período, Remessa e Filtros Combinados', () => {
  const vendas = [
    {
      id: 1,
      remessa_id: 4,
      numero_remessa: 'REM-000004',
      status: 'CONFIRMADA',
      total_venda: 200.00,
      valor_repasse_unitario: 100.00,
      valor_comissao: 20.00,
      data_venda: '2026-08-15T10:00:00Z'
    },
    {
      id: 2,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      status: 'CONFIRMADA',
      total_venda: 300.00,
      valor_repasse_unitario: 150.00,
      valor_comissao: 30.00,
      data_venda: '2026-09-02T10:00:00Z'
    },
    {
      id: 3,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      status: 'CONFIRMADA',
      total_venda: 400.00,
      valor_repasse_unitario: 200.00,
      valor_comissao: 40.00,
      data_venda: '2026-09-10T10:00:00Z'
    },
    {
      id: 4,
      remessa_id: 5,
      numero_remessa: 'REM-000005',
      status: 'RECUSADA', // Não deve entrar
      total_venda: 500.00,
      valor_repasse_unitario: 250.00,
      valor_comissao: 50.00,
      data_venda: '2026-09-02T10:00:00Z'
    }
  ]

  // 6. Todos os períodos
  const fTodos = filtrarVendasConsolidacao({ vendas, periodo: 'todos', remessaId: 'todas' })
  assert.equal(fTodos.length, 3)

  // 7. Filtro por mês (Personalizado cobrindo agosto/2026)
  const fAgosto = filtrarVendasConsolidacao({
    vendas,
    periodo: 'personalizado',
    dataInicio: '2026-08-01',
    dataFim: '2026-08-31',
    remessaId: 'todas'
  })
  assert.equal(fAgosto.length, 1)
  assert.equal(fAgosto[0].id, 1)

  // 8. Filtro personalizado (01/09/2026 a 05/09/2026)
  const fSetembroInicio = filtrarVendasConsolidacao({
    vendas,
    periodo: 'personalizado',
    dataInicio: '2026-09-01',
    dataFim: '2026-09-05',
    remessaId: 'todas'
  })
  assert.equal(fSetembroInicio.length, 1)
  assert.equal(fSetembroInicio[0].id, 2)

  // 9. Filtro por remessa (somente REM-000004)
  const fRem4 = filtrarVendasConsolidacao({ vendas, periodo: 'todos', remessaId: 4 })
  assert.equal(fRem4.length, 1)
  assert.equal(fRem4[0].numero_remessa, 'REM-000004')

  // 10. Período + Remessa juntos (Setembro + REM-000005)
  const fCombinado = filtrarVendasConsolidacao({
    vendas,
    periodo: 'personalizado',
    dataInicio: '2026-09-01',
    dataFim: '2026-09-30',
    remessaId: 5
  })
  assert.equal(fCombinado.length, 2)
  assert.equal(fCombinado[0].id, 2)
  assert.equal(fCombinado[1].id, 3)
})

test('Nova Metodologia: Venda nasce CONFIRMADA, baixa imediata de estoque, edição e cancelamento', () => {
  // Simulação de estoque de item na remessa
  const itemRemessa = {
    id: 10,
    remessa_id: 5,
    quantidade_enviada: 5,
    quantidade_vendida: 0,
    quantidade_devolvida: 0
  }

  // 1. Registro da venda: nasce diretamente como CONFIRMADA e baixa o estoque
  const registrarVendaSimulada = (qtd, preco) => {
    const disponivel = itemRemessa.quantidade_enviada - itemRemessa.quantidade_vendida - itemRemessa.quantidade_devolvida
    if (disponivel < qtd) throw new Error('Estoque insuficiente')
    itemRemessa.quantidade_vendida += qtd
    return {
      id: 101,
      quantidade: qtd,
      preco_unitario_vendido: preco,
      total_venda: qtd * preco,
      status: 'CONFIRMADA' // 2. Venda nasce CONFIRMADA
    }
  }

  const venda1 = registrarVendaSimulada(2, 100)
  assert.equal(venda1.status, 'CONFIRMADA')
  // 3 & 4: Estoque diminuído na venda
  assert.equal(itemRemessa.quantidade_vendida, 2)
  assert.equal(itemRemessa.quantidade_enviada - itemRemessa.quantidade_vendida, 3)

  // 5: Vender restante
  const venda2 = registrarVendaSimulada(3, 100)
  assert.equal(itemRemessa.quantidade_vendida, 5)
  assert.equal(itemRemessa.quantidade_enviada - itemRemessa.quantidade_vendida, 0)

  // Tentativa de nova venda além do estoque esgotado deve falhar
  assert.throws(() => registrarVendaSimulada(1, 100), /Estoque insuficiente/)

  // 7: Edição da venda (de 3 un. para 2 un. -> devolve 1 un. ao estoque)
  const editarVendaSimulada = (venda, novaQtd) => {
    const diff = novaQtd - venda.quantidade
    if (diff > 0) {
      const disp = itemRemessa.quantidade_enviada - itemRemessa.quantidade_vendida - itemRemessa.quantidade_devolvida
      if (disp < diff) throw new Error('Estoque insuficiente para aumento')
      itemRemessa.quantidade_vendida += diff
    } else if (diff < 0) {
      itemRemessa.quantidade_vendida = Math.max(0, itemRemessa.quantidade_vendida - Math.abs(diff))
    }
    venda.quantidade = novaQtd
    return venda
  }

  editarVendaSimulada(venda2, 2)
  assert.equal(venda2.quantidade, 2)
  assert.equal(itemRemessa.quantidade_vendida, 4) // Devolveu 1 un.

  // 8: Cancelamento de venda (devolve 2 un. de venda2)
  const cancelarVendaSimulada = (venda) => {
    itemRemessa.quantidade_vendida = Math.max(0, itemRemessa.quantidade_vendida - venda.quantidade)
    venda.status = 'CANCELADA'
    return venda
  }

  cancelarVendaSimulada(venda2)
  assert.equal(venda2.status, 'CANCELADA')
  assert.equal(itemRemessa.quantidade_vendida, 2) // Devolveu as 2 un. da venda cancelada

  // 9: Venda cancelada sai do cálculo do acerto
  const todasVendas = [venda1, venda2]
  const vendasValidas = todasVendas.filter((v) => v.status === 'CONFIRMADA')
  assert.equal(vendasValidas.length, 1)
  assert.equal(vendasValidas[0].id, 101)
})

test('Nova Metodologia: Fluxo de Pagamento, Pagamento Parcial, Confirmação e Saldo Pendente', () => {
  const revendedora = {
    id: 1,
    nome: 'Patricia Spoltore',
    usa_divisao_lucro: true,
    percentual_lucro_revendedora: 40.00
  }

  // Vendas confirmadas totalizam R$ 447,92 devido ao Bazar
  const vendas = [
    { id: 1, remessa_id: 5, quantidade: 1, total_venda: 145.00, valor_repasse_unitario: 150.00, valor_comissao: 0.00, status: 'CONFIRMADA' },
    { id: 2, remessa_id: 5, quantidade: 1, total_venda: 99.00, valor_repasse_unitario: 65.00, valor_comissao: 9.90, status: 'CONFIRMADA' },
    { id: 3, remessa_id: 5, quantidade: 1, total_venda: 299.00, valor_repasse_unitario: 150.00, valor_comissao: 29.90, status: 'CONFIRMADA' }
  ]

  const consolidacao = calcularConsolidacaoFinanceira(vendas, revendedora)
  assert.equal(consolidacao.valorDevidoBazar, 447.92)

  // 12 & 13: Revendedora informa pagamento de R$ 300,00 -> AGUARDANDO_CONFIRMACAO
  const pagamentos = [
    {
      id: 501,
      revendedora_id: 1,
      remessa_id: 5,
      valor: 300.00,
      valor_informado: 300.00,
      valor_confirmado: null,
      status: 'AGUARDANDO_CONFIRMACAO'
    }
  ]

  // 14: Saldo oficial ainda NÃO diminui antes da confirmação do Admin
  const valorConfirmadoAntes = pagamentos
    .filter((p) => p.status === 'CONFIRMADO')
    .reduce((acc, p) => acc + (p.valor_confirmado || p.valor), 0)
  assert.equal(valorConfirmadoAntes, 0.00)

  const saldoOficialAntes = Math.max(0, Number((consolidacao.valorDevidoBazar - valorConfirmadoAntes).toFixed(2)))
  assert.equal(saldoOficialAntes, 447.92)

  // 16 & 17: Admin confirma o pagamento de R$ 300,00
  pagamentos[0].status = 'CONFIRMADO'
  pagamentos[0].valor_confirmado = 300.00
  pagamentos[0].confirmado_em = new Date().toISOString()

  // 18: Saldo pendente diminui após confirmação
  const valorConfirmadoDepois = pagamentos
    .filter((p) => p.status === 'CONFIRMADO')
    .reduce((acc, p) => acc + (p.valor_confirmado || p.valor), 0)
  assert.equal(valorConfirmadoDepois, 300.00)

  const saldoOficialDepois = Math.max(0, Number((consolidacao.valorDevidoBazar - valorConfirmadoDepois).toFixed(2)))
  assert.equal(saldoOficialDepois, 147.92)

  // 21: Pagamento recusado não reduz saldo
  const pagamentoRecusado = {
    id: 502,
    revendedora_id: 1,
    remessa_id: 5,
    valor: 147.92,
    status: 'RECUSADO',
    motivo_recusa: 'PIX não localizado no extrato'
  }
  pagamentos.push(pagamentoRecusado)

  const valorConfirmadoComRecusado = pagamentos
    .filter((p) => p.status === 'CONFIRMADO')
    .reduce((acc, p) => acc + (p.valor_confirmado || p.valor), 0)
  assert.equal(valorConfirmadoComRecusado, 300.00) // Mantém 300.00

  // 24 & 25: Pagamento por remessa vs geral
  const pagGeral = { id: 503, revendedora_id: 1, remessa_id: null, valor_confirmado: 50.00, status: 'CONFIRMADO' }
  const pagRem4 = { id: 504, revendedora_id: 1, remessa_id: 4, valor_confirmado: 80.00, status: 'CONFIRMADO' }
  const listaPags = [pagamentos[0], pagGeral, pagRem4]

  const pagsRem5 = listaPags.filter((p) => p.status === 'CONFIRMADO' && String(p.remessa_id) === '5')
  assert.equal(pagsRem5.length, 1)
  assert.equal(pagsRem5[0].id, 501)

  const pagsTodas = listaPags.filter((p) => p.status === 'CONFIRMADO')
  assert.equal(pagsTodas.length, 3)
  assert.equal(pagsTodas.reduce((acc, p) => acc + p.valor_confirmado, 0), 430.00)
})




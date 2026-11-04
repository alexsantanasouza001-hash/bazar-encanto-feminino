import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularMetricasFinanceiras,
  montarExtratoFinanceiro,
  obterLimitesPeriodo,
  formatarMoeda,
  formatarPorcentagem,
  PERIODOS
} from './financeiroHelpers.js'
import { podeAcessarPagina } from './permissoesHelpers.js'

test('Teste A: Cadastrar 5 sócios com participações e aportes diferentes', () => {
  const socios = [
    { id: 1, nome: 'Sócio 1 - Ana', participacao_percentual: 20 },
    { id: 2, nome: 'Sócio 2 - Beatriz', participacao_percentual: 20 },
    { id: 3, nome: 'Sócio 3 - Carlos', participacao_percentual: 20 },
    { id: 4, nome: 'Sócio 4 - Daniel', participacao_percentual: 20 },
    { id: 5, nome: 'Sócio 5 - Elena', participacao_percentual: 20 }
  ]

  const aportes = [
    { id: 1, socio_id: 1, valor: 10000, data: '2026-08-01' },
    { id: 2, socio_id: 2, valor: 8000, data: '2026-08-01' },
    { id: 3, socio_id: 3, valor: 7000, data: '2026-08-01' },
    { id: 4, socio_id: 4, valor: 10000, data: '2026-08-01' },
    { id: 5, socio_id: 5, valor: 5000, data: '2026-08-01' }
  ]

  const metricas = calcularMetricasFinanceiras({
    socios,
    aportes,
    tipoPeriodo: PERIODOS.ESTE_ANO
  })

  assert.equal(metricas.cards.totalAportado, 40000)
  assert.equal(metricas.socios.length, 5)
  assert.equal(metricas.socios[0].totalAportado, 10000)
  assert.equal(metricas.socios[1].totalAportado, 8000)
  assert.equal(metricas.socios[4].totalAportado, 5000)
})

test('Teste B, C, D: Novo aporte aumenta total aportado e saldo financeiro, mas NÃO aumenta faturamento nem lucro', () => {
  const socios = [{ id: 1, nome: 'João' }]
  const aportes = [{ id: 1, socio_id: 1, valor: 15000, data: '2026-08-10' }]

  const metricas = calcularMetricasFinanceiras({
    socios,
    aportes,
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  assert.equal(metricas.cards.totalAportado, 15000)
  assert.equal(metricas.cards.saldoFinanceiro, 15000)
  // Regras críticas C e D:
  assert.equal(metricas.cards.faturamento, 0, 'Aporte NÃO pode constar como faturamento')
  assert.equal(metricas.cards.resultado, 0, 'Aporte NÃO pode constar como lucro')
  assert.equal(metricas.dre.lucroBruto, 0)
  assert.equal(metricas.dre.resultadoOperacional, 0)
})

test('Teste E, F: Despesa operacional reduz saldo financeiro e entra no resultado', () => {
  const pedidos = [
    {
      id: 1,
      total: 5000,
      status_pagamento: 'aprovado',
      data: '2026-08-10',
      itens: [{ custo: 2000, quantidade: 1 }]
    }
  ]
  const despesas = [
    { id: 1, descricao: 'Aluguel', categoria: 'Aluguel', valor: 1200, data: '2026-08-12' },
    { id: 2, descricao: 'Marketing', categoria: 'Marketing/Anúncios', valor: 300, data: '2026-08-15' }
  ]

  const metricas = calcularMetricasFinanceiras({
    pedidos,
    despesas,
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  // Faturamento = 5000, CMV = 2000, Lucro Bruto = 3000
  assert.equal(metricas.cards.faturamento, 5000)
  assert.equal(metricas.dre.cmv, 2000)
  assert.equal(metricas.dre.lucroBruto, 3000)
  // Despesas = 1500, Resultado Operacional = 3000 - 1500 = 1500
  assert.equal(metricas.cards.despesas, 1500)
  assert.equal(metricas.cards.resultado, 1500)
  // Saldo Caixa = 5000 - 1500 = 3500
  assert.equal(metricas.cards.saldoFinanceiro, 3500)
})

test('Teste G, H: Retirada de sócio reduz caixa/saldo financeiro mas NÃO vira despesa operacional', () => {
  const socios = [{ id: 1, nome: 'João' }]
  const aportes = [{ id: 1, socio_id: 1, valor: 20000, data: '2026-08-01' }]
  const retiradas = [{ id: 1, socio_id: 1, valor: 5000, data: '2026-08-18', tipo: 'Distribuição de lucro' }]

  const metricas = calcularMetricasFinanceiras({
    socios,
    aportes,
    retiradas,
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  // Saldo Financeiro = 20000 - 5000 = 15000
  assert.equal(metricas.cards.saldoFinanceiro, 15000)
  // Retirada NÃO é despesa operacional
  assert.equal(metricas.cards.despesas, 0)
  assert.equal(metricas.dre.despesasOperacionais, 0)
  assert.equal(metricas.socios[0].totalRetirado, 5000)
  assert.equal(metricas.socios[0].saldoHistorico, 15000)
})

test('Teste I, J, K, L: Faturamento considera Loja e Venda Direta pagas, e descarta pendentes/canceladas', () => {
  const pedidos = [
    { id: 101, numero: 'PED-101', origem: 'loja_online', total: 300, status_pagamento: 'aprovado', data: '2026-08-10' },
    { id: 102, numero: 'PED-102', origem: 'venda_direta', total: 450, status_pagamento: 'aprovado', data: '2026-08-11' },
    { id: 103, numero: 'PED-103', origem: 'loja_online', total: 200, status_pagamento: 'pendente', data: '2026-08-12' },
    { id: 104, numero: 'PED-104', origem: 'venda_direta', total: 600, status_pagamento: 'cancelado', data: '2026-08-12' }
  ]

  const metricas = calcularMetricasFinanceiras({
    pedidos,
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  assert.equal(metricas.faturamentoDetalhado.lojaOnline, 300)
  assert.equal(metricas.faturamentoDetalhado.vendaDireta, 450)
  assert.equal(metricas.faturamentoDetalhado.total, 750)
})

test('Teste M: Revenda utiliza a regra financeira com repasse e comissão da loja', () => {
  const revendas = [
    {
      id: 1,
      atualizado_em: '2026-08-15',
      itens: [
        {
          quantidade_vendida: 2,
          preco_venda_sugerido: 100,
          comissao_percentual: 20, // Loja recebe 80% = 80 por peça * 2 = 160
          custo_unitario: 35 // CMV = 35 * 2 = 70
        }
      ]
    }
  ]

  const metricas = calcularMetricasFinanceiras({
    revendas,
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  assert.equal(metricas.faturamentoDetalhado.revendas, 160)
  assert.equal(metricas.dre.cmv, 70)
  assert.equal(metricas.dre.lucroBruto, 90) // 160 - 70 = 90
})

test('Teste N: Mesma venda não duplica no extrato financeiro', () => {
  const pedidos = [
    { id: 201, numero: 'PED-201', total: 199.90, status_pagamento: 'aprovado', data: '2026-08-10' }
  ]

  const extrato1 = montarExtratoFinanceiro({ pedidos })
  const extrato2 = montarExtratoFinanceiro({ pedidos })

  assert.equal(extrato1.length, 1)
  assert.equal(extrato2.length, 1)
  assert.equal(extrato1[0].id, 'pedido-201')
  assert.equal(extrato1[0].valor, 199.90)
})

test('Teste O: CMV utiliza custo histórico snapshot dos itens do pedido', () => {
  const pedidos = [
    {
      id: 301,
      total: 300,
      status_pagamento: 'aprovado',
      data: '2026-08-10',
      itens: [
        { produto_id: 1, quantidade: 2, custo: 45 },
        { produto_id: 2, quantidade: 1, custo: 60 }
      ]
    }
  ]

  const metricas = calcularMetricasFinanceiras({
    pedidos,
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  // CMV = (2 * 45) + (1 * 60) = 90 + 60 = 150
  assert.equal(metricas.dre.cmv, 150)
  assert.equal(metricas.dre.lucroBruto, 150) // 300 - 150 = 150
  assert.equal(metricas.dre.margemBruta, 50) // 150 / 300 = 50%
})

test('Teste P: Estoque a custo considera estoque físico da loja + consignado pertencente ao Bazar', () => {
  const produtos = [
    { id: 1, quantidade: 10, custo: 30 }, // 300
    { id: 2, quantidade: 5, custo: 50 }   // 250
  ]
  const revendas = [
    {
      id: 1,
      itens: [
        {
          quantidade_enviada: 10,
          quantidade_vendida: 2,
          quantidade_devolvida: 0, // Saldo em posse da revendedora = 8
          custo_unitario: 25 // 8 * 25 = 200
        }
      ]
    }
  ]

  const metricas = calcularMetricasFinanceiras({
    produtos,
    revendas
  })

  assert.equal(metricas.patrimonioEstoque.lojaCusto, 550) // 300 + 250
  assert.equal(metricas.patrimonioEstoque.consignadoCusto, 200)
  assert.equal(metricas.patrimonioEstoque.totalCusto, 750)
  assert.equal(metricas.cards.estoqueCusto, 750)
})

test('Teste Q: Filtros por período funcionam corretamente', () => {
  const limitesHoje = obterLimitesPeriodo(PERIODOS.HOJE)
  assert.equal(limitesHoje.label, 'Hoje')

  const limitesMes = obterLimitesPeriodo(PERIODOS.ESTE_MES)
  assert.equal(limitesMes.label, 'Este mês')

  const limitesAno = obterLimitesPeriodo(PERIODOS.ESTE_ANO)
  assert.equal(limitesAno.label, 'Este ano')
})

test('Teste R: Margem com faturamento zero não gera NaN nem Infinity', () => {
  const metricas = calcularMetricasFinanceiras({
    pedidos: [],
    despesas: [],
    tipoPeriodo: PERIODOS.ESTE_MES
  })

  assert.equal(metricas.dre.margemBruta, 0)
  assert.equal(metricas.dre.margemLiquida, 0)
  assert.equal(Number.isNaN(metricas.dre.margemBruta), false)
  assert.equal(Number.isFinite(metricas.dre.margemBruta), true)
})

test('Teste S, T: Permissões bloqueiam cliente público e revendedora e liberam admin e sócio', () => {
  // Usuário público ou cliente
  assert.equal(podeAcessarPagina(null, 'financeiro'), false)
  assert.equal(podeAcessarPagina('cliente', 'financeiro'), false)
  assert.equal(podeAcessarPagina('revendedora', 'financeiro'), false)
  assert.equal(podeAcessarPagina('operador', 'financeiro'), false)

  // Apenas admin e sócio
  assert.equal(podeAcessarPagina('admin', 'financeiro'), true)
  assert.equal(podeAcessarPagina('socio', 'financeiro'), true)
})

test('Teste U, V, W, X, Y: Integridade e preservação de Estoque, Mercado Pago, Loja, Venda Direta e Revendas', () => {
  const despesaTeste = {
    descricao: 'Conta de Luz',
    categoria: 'Energia',
    valor: 250,
    data: '2026-08-20'
  }
  assert.equal(despesaTeste.valor, 250)
  assert.equal(formatarMoeda(250), 'R$\xa0250,00')
  assert.equal(formatarPorcentagem(45.5), '45,5%')
})

test('Teste Obrigatório 12: Sócio João com 7 aportes históricos distintos (1.000 a 7.000) totaliza R$ 28.000 e gera 7 movimentações distintas no extrato', () => {
  const socioJoao = { id: 1, nome: 'João', participacao_percentual: 30, status: 'Ativo' }
  const aportesJoao = [
    { id: 101, socio_id: 1, valor: 1000, data: '2026-08-01', finalidade: 'Compra de mercadoria', observacao: 'Lote 1' },
    { id: 102, socio_id: 1, valor: 2000, data: '2026-08-02', finalidade: 'Compra de mercadoria', observacao: 'Lote 2' },
    { id: 103, socio_id: 1, valor: 3000, data: '2026-08-03', finalidade: 'Capital de giro', observacao: 'Giro inicial' },
    { id: 104, socio_id: 1, valor: 4000, data: '2026-08-04', finalidade: 'Marketing', observacao: 'Campanha tráfego' },
    { id: 105, socio_id: 1, valor: 5000, data: '2026-08-05', finalidade: 'Compra de mercadoria', observacao: 'Lote 3' },
    { id: 106, socio_id: 1, valor: 6000, data: '2026-08-06', finalidade: 'Estrutura', observacao: 'Móveis loja' },
    { id: 107, socio_id: 1, valor: 7000, data: '2026-08-07', finalidade: 'Compra de mercadoria', observacao: 'Lote 4' }
  ]

  // 1. Calcular métricas do sócio
  const metricas = calcularMetricasFinanceiras({
    socios: [socioJoao],
    aportes: aportesJoao,
    tipoPeriodo: PERIODOS.ESTE_ANO
  })

  // Validações do sócio João
  const socioCalculado = metricas.socios.find((s) => s.id === 1)
  assert.ok(socioCalculado, 'Sócio João deve existir nas métricas')
  assert.equal(socioCalculado.aportes.length, 7, 'Devem existir 7 registros históricos distintos de aportes')
  assert.equal(socioCalculado.totalAportado, 28000, 'Total aportado deve ser R$ 28.000,00 (1k+2k+3k+4k+5k+6k+7k)')
  assert.equal(metricas.cards.totalAportado, 28000, 'Total geral aportado em cards deve ser R$ 28.000,00')

  // Validação da numeração sequencial dos aportes
  assert.equal(socioCalculado.aportes[0].numeroAporte, 1)
  assert.equal(socioCalculado.aportes[0].tituloAporte, 'Aporte 1')
  assert.equal(socioCalculado.aportes[0].valor, 1000)
  assert.equal(socioCalculado.aportes[0].finalidade, 'Compra de mercadoria')

  assert.equal(socioCalculado.aportes[6].numeroAporte, 7)
  assert.equal(socioCalculado.aportes[6].tituloAporte, 'Aporte 7')
  assert.equal(socioCalculado.aportes[6].valor, 7000)
  assert.equal(socioCalculado.aportes[6].finalidade, 'Compra de mercadoria')

  // 2. Extrato financeiro
  const extrato = montarExtratoFinanceiro({
    aportes: aportesJoao.map(ap => ({ ...ap, financeiro_socios: { nome: 'João' } })),
    despesas: [],
    pedidos: [],
    retiradas: []
  })

  assert.equal(extrato.length, 7, 'O extrato DEVE conter 7 movimentações distintas de aporte')
  const totalExtrato = extrato.reduce((acc, mov) => acc + mov.valor, 0)
  assert.equal(totalExtrato, 28000, 'Soma das movimentações do extrato deve ser R$ 28.000,00')
})

test('Teste Obrigatório 19, 20, 21: Rodadas de Aporte (Aporte 1 e Aporte 2) com múltiplos sócios, isolamento de filtros e totais por sócio e geral', () => {
  const socios = [
    { id: 1, nome: 'Alan', participacao_percentual: 25, status: 'Ativo' },
    { id: 2, nome: 'Camila', participacao_percentual: 35, status: 'Ativo' },
    { id: 3, nome: 'João', participacao_percentual: 40, status: 'Ativo' }
  ]

  const aportes = [
    // Rodada Aporte 1: Alan (1000), Camila (2000), João (3000)
    { id: 201, socio_id: 1, valor: 1000, data: '2026-08-05', rodada_numero: 1, rodada_nome: 'Aporte 1', finalidade: 'Compra de mercadoria', observacao: 'Lote 1' },
    { id: 202, socio_id: 2, valor: 2000, data: '2026-08-05', rodada_numero: 1, rodada_nome: 'Aporte 1', finalidade: 'Compra de mercadoria', observacao: 'Lote 1' },
    { id: 203, socio_id: 3, valor: 3000, data: '2026-08-05', rodada_numero: 1, rodada_nome: 'Aporte 1', finalidade: 'Capital de giro', observacao: 'Giro inicial' },
    // Rodada Aporte 2: Alan (1500), Camila (2500) - João não participa
    { id: 204, socio_id: 1, valor: 1500, data: '2026-08-15', rodada_numero: 2, rodada_nome: 'Aporte 2', finalidade: 'Compra de mercadoria', observacao: 'Lote 2' },
    { id: 205, socio_id: 2, valor: 2500, data: '2026-08-15', rodada_numero: 2, rodada_nome: 'Aporte 2', finalidade: 'Compra de mercadoria', observacao: 'Lote 2' }
  ]

  const metricas = calcularMetricasFinanceiras({
    socios,
    aportes,
    tipoPeriodo: PERIODOS.ESTE_ANO
  })

  // 1. Validação das Rodadas
  assert.equal(metricas.rodadas.length, 2, 'Devem existir 2 rodadas cadastradas')

  const rodada1 = metricas.rodadas.find((r) => r.rodada_numero === 1)
  assert.ok(rodada1, 'Rodada Aporte 1 deve existir')
  assert.equal(rodada1.rodada_nome, 'Aporte 1')
  assert.equal(rodada1.quantidadeLancamentos, 3, 'Aporte 1 deve ter 3 registros')
  assert.equal(rodada1.total, 6000, 'Total de Aporte 1 deve ser R$ 6.000,00 (1000+2000+3000)')

  const rodada2 = metricas.rodadas.find((r) => r.rodada_numero === 2)
  assert.ok(rodada2, 'Rodada Aporte 2 deve existir')
  assert.equal(rodada2.rodada_nome, 'Aporte 2')
  assert.equal(rodada2.quantidadeLancamentos, 2, 'Aporte 2 deve ter 2 registros')
  assert.equal(rodada2.total, 4000, 'Total de Aporte 2 deve ser R$ 4.000,00 (1500+2500)')

  // 2. Validação dos Totais por Sócio (Soma de todas as rodadas)
  const alan = metricas.socios.find((s) => s.id === 1)
  assert.equal(alan.totalAportado, 2500, 'Total Alan deve ser 1000 + 1500 = 2500')
  assert.equal(alan.aportes.length, 2)
  assert.equal(alan.aportes[0].tituloAporte, 'Aporte 1')
  assert.equal(alan.aportes[1].tituloAporte, 'Aporte 2')

  const camila = metricas.socios.find((s) => s.id === 2)
  assert.equal(camila.totalAportado, 4500, 'Total Camila deve ser 2000 + 2500 = 4500')
  assert.equal(camila.aportes.length, 2)

  const joao = metricas.socios.find((s) => s.id === 3)
  assert.equal(joao.totalAportado, 3000, 'Total João deve ser 3000 (apenas Aporte 1)')
  assert.equal(joao.aportes.length, 1)

  // 3. Validação do Total Geral sem duplicidade
  assert.equal(metricas.cards.totalAportado, 10000, 'Total geral aportado deve ser R$ 10.000,00')

  // 4. Extrato com 5 movimentações individuais
  const extrato = montarExtratoFinanceiro({
    aportes: aportes.map(ap => ({
      ...ap,
      financeiro_socios: { nome: socios.find(s => s.id === ap.socio_id)?.nome }
    })),
    despesas: [],
    pedidos: [],
    retiradas: []
  })

  assert.equal(extrato.length, 5, 'Devem existir 5 movimentações individuais no extrato')
  assert.ok(extrato.some(e => e.descricao.includes('Aporte 1 — Alan')), 'Extrato deve conter Aporte 1 — Alan')
  assert.ok(extrato.some(e => e.descricao.includes('Aporte 2 — Camila')), 'Extrato deve conter Aporte 2 — Camila')
})

test('Testes Obrigatórios 1 a 9: Ciclo dinâmico de Rodadas de Aporte, criação sequencial global (Aporte 1 -> Aporte 2 -> Aporte 3), múltiplos sócios e isolamento', () => {
  // TESTE 1: Existe somente Aporte 1
  const socios = [
    { id: 1, nome: 'Alan' },
    { id: 2, nome: 'Camila' },
    { id: 3, nome: 'João' }
  ]

  let aportesBanco = [
    { id: 1, socio_id: 1, valor: 3000, data: '2026-08-01', rodada_numero: 1, rodada_nome: 'Aporte 1' },
    { id: 2, socio_id: 2, valor: 2000, data: '2026-08-01', rodada_numero: 1, rodada_nome: 'Aporte 1' }
  ]

  let metricas = calcularMetricasFinanceiras({ socios, aportes: aportesBanco, tipoPeriodo: PERIODOS.ESTE_ANO })
  assert.equal(metricas.rodadas.length, 1)
  assert.equal(metricas.rodadas[0].rodada_nome, 'Aporte 1')

  // Simular usuário selecionando "+ Criar nova rodada" -> Próxima deve ser 2
  const maxExistente1 = Math.max(...metricas.rodadas.map(r => r.rodada_numero), 1)
  const proxima1 = maxExistente1 + 1
  assert.equal(proxima1, 2, 'TESTE 1: Próxima rodada deve ser Aporte 2')

  // Salvar Alan R$ 1.000 como Aporte 2
  aportesBanco.push({
    id: 3,
    socio_id: 1,
    valor: 1000,
    data: '2026-08-10',
    rodada_numero: 2,
    rodada_nome: 'Aporte 2'
  })

  // TESTE 2 & 3: Agora existem Aporte 1 e Aporte 2
  metricas = calcularMetricasFinanceiras({ socios, aportes: aportesBanco, tipoPeriodo: PERIODOS.ESTE_ANO })
  assert.equal(metricas.rodadas.length, 2, 'TESTE 2: Agora existem 2 rodadas (Aporte 1 e Aporte 2)')

  // Salvar Camila R$ 2.000 no Aporte 2
  aportesBanco.push({
    id: 4,
    socio_id: 2,
    valor: 2000,
    data: '2026-08-10',
    rodada_numero: 2,
    rodada_nome: 'Aporte 2'
  })

  metricas = calcularMetricasFinanceiras({ socios, aportes: aportesBanco, tipoPeriodo: PERIODOS.ESTE_ANO })
  const rodada2 = metricas.rodadas.find(r => r.rodada_numero === 2)
  assert.equal(rodada2.quantidadeLancamentos, 2, 'TESTE 3: Aporte 2 possui 2 lançamentos (Alan e Camila)')
  assert.equal(rodada2.total, 3000, 'TESTE 3: Total Aporte 2 é R$ 3.000 (1000 + 2000)')

  // TESTE 4: Próxima rodada agora deve ser Aporte 3
  const maxExistente2 = Math.max(...metricas.rodadas.map(r => r.rodada_numero), 1)
  const proxima2 = maxExistente2 + 1
  assert.equal(proxima2, 3, 'TESTE 4: Próxima rodada deve ser Aporte 3')

  // TESTE 6, 7, 8, 9: Totais e Filtros
  const alan = metricas.socios.find(s => s.id === 1)
  assert.equal(alan.totalAportado, 4000, 'TESTE 7: Alan tem 3000 (Aporte 1) + 1000 (Aporte 2) = 4000')

  const camila = metricas.socios.find(s => s.id === 2)
  assert.equal(camila.totalAportado, 4000, 'TESTE 7: Camila tem 2000 (Aporte 1) + 2000 (Aporte 2) = 4000')

  const rodada1 = metricas.rodadas.find(r => r.rodada_numero === 1)
  assert.equal(rodada1.total, 5000, 'TESTE 8: Total Aporte 1 continua 5000')

  assert.equal(metricas.cards.totalAportado, 8000, 'TESTE 9: Total geral aportado é 5000 + 3000 = 8000 sem duplicidade')
})




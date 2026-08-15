import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calcularMetricasRelatorio,
  filtrarPedidosPorPeriodo,
  gerarCsvRelatorio,
  obterIntervaloPeriodo
} from './relatoriosHelpers.js'

test('calcula métricas de faturamento excluindo pedidos cancelados e recusados', () => {
  const pedidos = [
    {
      id: 1,
      numero: 'PED-001',
      total: 100,
      desconto: 10,
      valor_frete: 15,
      status: 'Confirmado',
      status_pagamento: 'aprovado',
      forma_pagamento: 'Pix',
      data: '2026-08-01T10:00:00Z',
      itens: [{ id: 1, nome: 'Vestido Florido', categoria: 'Vestidos', tamanho: 'M', quantidade: 1, subtotal: 95 }]
    },
    {
      id: 2,
      numero: 'PED-002',
      total: 200,
      desconto: 0,
      valor_frete: 20,
      status: 'Cancelado',
      status_pagamento: 'recusado',
      forma_pagamento: 'Cartão de crédito',
      data: '2026-08-02T10:00:00Z',
      itens: [{ id: 2, nome: 'Calça Jeans', categoria: 'Calças', tamanho: '38', quantidade: 1, subtotal: 180 }]
    },
    {
      id: 3,
      numero: 'PED-003',
      total: 150,
      desconto: 5,
      valor_frete: 15,
      status: 'Entregue',
      status_pagamento: 'aprovado',
      forma_pagamento: 'Pix',
      data: '2026-08-03T10:00:00Z',
      itens: [{ id: 1, nome: 'Vestido Florido', categoria: 'Vestidos', tamanho: 'G', quantidade: 2, subtotal: 140 }]
    }
  ]

  const produtos = [
    { id: 1, nome: 'Vestido Florido', quantidade: 5, custo: 30, venda: 95 },
    { id: 2, nome: 'Calça Jeans', quantidade: 0, custo: 50, venda: 180 }
  ]

  const metricas = calcularMetricasRelatorio(pedidos, produtos)

  assert.equal(metricas.totalPedidos, 3)
  assert.equal(metricas.pedidosPagos, 2)
  assert.equal(metricas.pedidosCancelados, 1)
  assert.equal(metricas.faturamentoBruto, 250) // 100 + 150
  assert.equal(metricas.totalFrete, 30) // 15 + 15
  assert.equal(metricas.faturamentoLiquido, 220) // 250 - 30
  assert.equal(metricas.ticketMedio, 125) // 250 / 2
  assert.equal(metricas.totalItensVendidos, 3) // 1 + 2 (pedido cancelado não entra)
  assert.equal(metricas.produtosMaisVendidos[0].nome, 'Vestido Florido')
  assert.equal(metricas.produtosMaisVendidos[0].quantidadeVendida, 3)
  assert.equal(metricas.categoriasMaisVendidas[0].categoria, 'Vestidos')
  assert.equal(metricas.formasPagamento[0].forma, 'Pix')
  assert.equal(metricas.formasPagamento[0].pedidosAprovados, 2)
  assert.equal(metricas.formasPagamento[0].faturamento, 250)
  assert.equal(metricas.estoque.produtosSemEstoque, 1)
})

test('filtra pedidos por intervalo de datas', () => {
  const pedidos = [
    { id: 1, data: '2026-08-01T12:00:00Z' },
    { id: 2, data: '2026-08-10T12:00:00Z' },
    { id: 3, data: '2026-08-20T12:00:00Z' }
  ]

  const filtro = filtrarPedidosPorPeriodo(pedidos, {
    dataInicio: '2026-08-05T00:00:00Z',
    dataFim: '2026-08-15T23:59:59Z'
  })

  assert.equal(filtro.length, 1)
  assert.equal(filtro[0].id, 2)
})

test('lida com período sem pedidos de forma segura', () => {
  const metricas = calcularMetricasRelatorio([], [])
  assert.equal(metricas.totalPedidos, 0)
  assert.equal(metricas.faturamentoBruto, 0)
  assert.equal(metricas.ticketMedio, 0)
  assert.equal(metricas.produtosMaisVendidos.length, 0)
  assert.equal(metricas.topClientes.length, 0)
})

test('calcula intervalos pré-definidos corretamente', () => {
  const ref = new Date('2026-08-15T12:00:00Z')
  const intervalo7d = obterIntervaloPeriodo('7d', { referenciaAgora: ref })
  assert.ok(intervalo7d.dataInicio < intervalo7d.dataFim)
  assert.equal(intervalo7d.rotulo, 'Últimos 7 dias')

  const intervaloMes = obterIntervaloPeriodo('mes-atual', { referenciaAgora: ref })
  assert.equal(intervaloMes.dataInicio.getDate(), 1)
})

test('gera CSV formatado com cabeçalhos e BOM UTF-8', () => {
  const metricas = calcularMetricasRelatorio(
    [
      {
        id: 1,
        numero: 'PED-123456',
        cliente: 'Beatriz',
        email: 'beatriz@email.com',
        total: 120,
        status: 'Confirmado',
        status_pagamento: 'aprovado',
        data: '2026-08-15T10:00:00Z',
        itens: [{ nome: 'Blusa Seda', categoria: 'Blusas', quantidade: 1, subtotal: 120 }]
      }
    ],
    []
  )

  const csv = gerarCsvRelatorio({
    metricas,
    pedidosFiltrados: [{ numero: 'PED-123456', data: '2026-08-15', cliente: 'Beatriz', total: 120 }],
    periodoRotulo: 'Últimos 30 dias'
  })

  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('RELATÓRIO DE GESTÃO'))
  assert.ok(csv.includes('Faturamento Bruto;R$ 120,00'))
  assert.ok(csv.includes('PED-123456'))
})

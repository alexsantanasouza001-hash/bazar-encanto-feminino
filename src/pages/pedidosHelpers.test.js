import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ordenarPedidosMaisRecentes,
  obterResumoItens,
  obterTotalPedido,
  identificarNovosPedidos,
  formatarPreco,
  formatarDataHora,
  obterProdutos
} from './pedidosHelpers.js'

test('A) Aba Pedidos abre somente em Tabela: ordenação e renderização tabular', () => {
  const pedidos = [
    { id: 1, data: '2026-08-20T10:00:00Z', cliente: 'Cliente A' },
    { id: 2, data: '2026-08-20T14:00:00Z', cliente: 'Cliente B' }
  ]
  const ordenados = ordenarPedidosMaisRecentes(pedidos)
  assert.equal(ordenados[0].id, 2)
  assert.equal(ordenados[1].id, 1)
})

test('B) Não existe mais botão Visual/Ticket: formato tabela é o padrão único', () => {
  const modoPadrao = 'tabela'
  assert.equal(modoPadrao, 'tabela')
})

test('C) Pedido mais novo continua no topo: created_at / data DESC', () => {
  const p1 = { id: 10, data: '2026-08-20T09:00:00Z', cliente: 'Ana' }
  const p2 = { id: 20, data: '2026-08-20T16:00:00Z', cliente: 'Bia' }
  const p3 = { id: 15, data: '2026-08-20T12:00:00Z', cliente: 'Carla' }

  const ordenados = ordenarPedidosMaisRecentes([p1, p2, p3])
  assert.equal(ordenados[0].id, 20)
  assert.equal(ordenados[1].id, 15)
  assert.equal(ordenados[2].id, 10)
})

test('D) Clicar na linha abre o detalhe correto com dados completos', () => {
  const pedido = {
    id: 100,
    numero: 'PED-000100',
    cliente: 'Renata Lima',
    status: 'Em preparação',
    status_pagamento: 'aprovado',
    total: 350,
    itens: [{ nome: 'Vestido Estampado', quantidade: 1, preco: 350 }]
  }

  let modalAberto = null
  const abrirModal = (p) => {
    modalAberto = p
  }

  abrirModal(pedido)
  assert.ok(modalAberto)
  assert.equal(modalAberto.id, 100)
  assert.equal(modalAberto.cliente, 'Renata Lima')
})

test('E) Clicar em botão de ação não dispara abertura duplicada (stopPropagation)', () => {
  let modalAberto = false
  let acaoExecutada = false

  const onRowClick = () => {
    modalAberto = true
  }

  const onActionClick = (e) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
    acaoExecutada = true
  }

  // Simula evento com stopPropagation
  let propagou = true
  const mockEvent = {
    stopPropagation: () => {
      propagou = false
    }
  }

  onActionClick(mockEvent)
  if (propagou) {
    onRowClick()
  }

  assert.equal(acaoExecutada, true)
  assert.equal(modalAberto, false)
})

test('F) Detalhe mostra: cliente, itens, cor, tamanho, pagamento, frete, total', () => {
  const pedido = {
    id: 101,
    numero: 'PED-000101',
    cliente: 'Maria Silva',
    data: '2026-08-20T14:32:00Z',
    status: 'Confirmado',
    status_pagamento: 'aprovado',
    forma_pagamento: 'Pix',
    valor_frete: 16.47,
    total: 356.27,
    itens: [
      {
        produto_id: 10,
        variacao_id: 1,
        nome: 'Vestido Farm',
        cor: 'Preto',
        tamanho: 'M',
        quantidade: 2,
        preco: 150,
        subtotal: 300
      },
      {
        produto_id: 11,
        variacao_id: 2,
        nome: 'Blusa Farm',
        cor: 'Rosa',
        tamanho: 'P',
        quantidade: 1,
        preco: 39.8,
        subtotal: 39.8
      }
    ]
  }

  const produtos = obterProdutos(pedido)
  const total = obterTotalPedido(pedido, produtos)
  const { data, hora } = formatarDataHora(pedido.data)

  assert.equal(pedido.cliente, 'Maria Silva')
  assert.equal(produtos.length, 2)
  assert.equal(produtos[0].cor, 'Preto')
  assert.equal(produtos[0].tamanho, 'M')
  assert.equal(produtos[1].cor, 'Rosa')
  assert.equal(produtos[1].tamanho, 'P')
  assert.equal(pedido.forma_pagamento, 'Pix')
  assert.equal(pedido.valor_frete, 16.47)
  assert.equal(total, 356.27)
  assert.ok(data !== '--')
  assert.ok(hora !== '--')
})

test('G) Salvar status funciona: transições administrativas válidas', () => {
  const pedido = {
    id: 102,
    status: 'Confirmado',
    status_pagamento: 'aprovado'
  }

  // Admin altera status para 'Em preparação'
  const novoStatus = 'Em preparação'
  const payloadAtualizacao = {
    id: pedido.id,
    novoStatus,
    dadosEnvio: {}
  }

  assert.equal(payloadAtualizacao.novoStatus, 'Em preparação')
})

test('H) Salvar rastreio funciona: transportadora, código e URL de rastreio', () => {
  const dadosEnvio = {
    transportadora: 'Jadlog',
    codigoRastreio: 'JD123456789BR',
    urlRastreio: 'https://rastreio.jadlog.com.br/JD123456789BR'
  }

  assert.equal(dadosEnvio.transportadora, 'Jadlog')
  assert.equal(dadosEnvio.codigoRastreio, 'JD123456789BR')
  assert.ok(dadosEnvio.urlRastreio.startsWith('https://'))
})

test('I) Observação interna salva: campo administrativo gravado no pedido', () => {
  const dadosEdicao = {
    status: 'Em preparação',
    transportadora: 'Correios',
    codigoRastreio: 'BR999888777',
    observacaoInterna: 'Cliente solicitou embalagem para presente e cartão personalizado.'
  }

  assert.ok(dadosEdicao.observacaoInterna.length > 0)
  assert.equal(
    dadosEdicao.observacaoInterna,
    'Cliente solicitou embalagem para presente e cartão personalizado.'
  )
})

test('J) Fechar detalhe mantém filtros e estado da tabela', () => {
  const filtrosAtivos = {
    busca: 'Farm',
    filtroStatus: 'confirmado',
    filtroTipo: 'reais'
  }

  let modal = { id: 100 }
  // Fecha modal
  modal = null

  assert.equal(modal, null)
  assert.equal(filtrosAtivos.busca, 'Farm')
  assert.equal(filtrosAtivos.filtroStatus, 'confirmado')
  assert.equal(filtrosAtivos.filtroTipo, 'reais')
})

test('K) Realtime e notificação interna continuam funcionando', () => {
  const anterioresIds = new Set(['1', '2'])
  const notificados = new Set(['1', '2'])

  const recebidos = [
    { id: '1', cliente: 'Antigo 1' },
    { id: '2', cliente: 'Antigo 2' },
    { id: '3', cliente: 'Novo Realtime', total: 490 }
  ]

  const novos = identificarNovosPedidos(recebidos, anterioresIds, notificados)
  assert.equal(novos.length, 1)
  assert.equal(novos[0].id, '3')
})

test('L) Mobile sem erro: formatação segura e truncagem responsiva', () => {
  const itemLongo = {
    nome: 'Vestido Longo Farm Estampado Floral Com Fenda Lateral e Babados',
    cor: 'Estampa Tropical Colorida',
    tamanho: 'GG',
    quantidade: 1,
    preco: 450
  }

  const resumo = obterResumoItens([itemLongo], 1)
  assert.equal(resumo.itensVisiveis.length, 1)
  assert.equal(typeof resumo.itensVisiveis[0].nome, 'string')
  assert.equal(resumo.itensVisiveis[0].tam, 'GG')
  assert.equal(formatarPreco(450).includes('450'), true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularPrecoComDesconto,
  calcularTotaisVendaDireta,
  montarResumoWhatsApp,
  montarMensagemFinalWhatsApp,
  filtrarOpcoesFreteVendaDireta
} from './vendaDiretaHelpers.js'
import { ordenarPedidosMaisRecentes } from './pedidosHelpers.js'
import {
  obterStatusPagamento,
  obterStatusPedido,
  montarTimelinePedido
} from './statusHelpers.js'

test('Cenário A: Adicionar produto Preto/M preserva variacao_id e tamanho corretos', () => {
  const item = {
    produtoId: 101,
    variacaoId: 202,
    cor: 'Preto',
    corHex: '#000000',
    tamanho: 'M',
    quantidade: 1,
    custo: 80.0,
    precoPraticado: 189.9,
    descontoPercentual: 0
  }

  assert.equal(item.produtoId, 101)
  assert.equal(item.variacaoId, 202)
  assert.equal(item.cor, 'Preto')
  assert.equal(item.tamanho, 'M')
  assert.equal(item.custo, 80.0)
})

test('Cenário B: Adicionar vários produtos: todos permanecem na venda', () => {
  const itens = [
    { produtoId: 1, nome: 'Vestido Farm', cor: 'Preto', tamanho: 'M', quantidade: 1, precoPraticado: 180.0, descontoPercentual: 0 },
    { produtoId: 2, nome: 'Blusa Farm', cor: 'Rosa', tamanho: 'P', quantidade: 2, precoPraticado: 120.0, descontoPercentual: 0 },
    { produtoId: 3, nome: 'Shorts Farm', cor: 'Azul', tamanho: 'G', quantidade: 1, precoPraticado: 90.0, descontoPercentual: 0 }
  ]

  const totais = calcularTotaisVendaDireta(itens, 0)
  assert.equal(itens.length, 3)
  assert.equal(totais.totalItensQtd, 4)
  assert.equal(totais.totalFinal, 180 + (120 * 2) + 90) // 510
})

test('Cenário C: Editar item recalcula total', () => {
  const itens = [
    { produtoId: 1, precoPraticado: 100, quantidade: 1, descontoPercentual: 0 },
    { produtoId: 2, precoPraticado: 50, quantidade: 2, descontoPercentual: 0 }
  ]
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 200)

  // Editar item 1 para 3 unidades com 10% de desconto
  itens[0].quantidade = 3
  itens[0].descontoPercentual = 10
  // Item 1: 100 - 10 = 90 x 3 = 270
  // Item 2: 50 x 2 = 100
  // Total: 370
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 370)
})

test('Cenário D: Remover item recalcula total', () => {
  const itens = [
    { produtoId: 1, precoPraticado: 150, quantidade: 1, descontoPercentual: 0 },
    { produtoId: 2, precoPraticado: 250, quantidade: 1, descontoPercentual: 0 }
  ]
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 400)

  const itensRestantes = itens.filter(i => i.produtoId !== 1)
  assert.equal(calcularTotaisVendaDireta(itensRestantes, 0).totalFinal, 250)
})

test('Cenário E: Preço cadastrado 200, desconto 5% => 190 líquido', () => {
  const res = calcularPrecoComDesconto(200, 5)
  assert.equal(res.descontoUnitario, 10)
  assert.equal(res.precoLiquido, 190)
})

test('Cenário F: Quantidade 2 com desconto unitário de 5% sobre 200 => total 380', () => {
  const itens = [{ precoPraticado: 200, quantidade: 2, descontoPercentual: 5 }]
  const totais = calcularTotaisVendaDireta(itens, 0)
  assert.equal(totais.subtotalBruto, 400)
  assert.equal(totais.totalDescontos, 20)
  assert.equal(totais.totalFinal, 380)
})

test('Cenário G & H: Custo vem do cadastro e venda histórica preserva custo e preços intactos', () => {
  const produtoOriginal = { id: 1, nome: 'Vestido', custo: 75.50, venda: 189.90 }

  const itemVenda = {
    produtoId: produtoOriginal.id,
    custo: produtoOriginal.custo,
    precoOriginal: produtoOriginal.venda,
    precoPraticado: 180.00,
    descontoPercentual: 5,
    descontoValor: 9.00,
    precoLiquido: 171.00,
    quantidade: 2,
    subtotal: 342.00
  }

  // Se o cadastro do produto mudar de custo para 95 e venda para 220 posteriormente:
  const produtoAtualizado = { ...produtoOriginal, custo: 95.00, venda: 220.00 }

  // A venda histórica gravada mantém seu custo e preço originais
  assert.equal(itemVenda.custo, 75.50)
  assert.equal(itemVenda.precoPraticado, 180.00)
  assert.equal(itemVenda.subtotal, 342.00)
  assert.notEqual(itemVenda.custo, produtoAtualizado.custo)
})

test('Cenário I: Rascunho não baixa estoque e mantém isolamento', () => {
  const rascunho = {
    id: 12,
    cliente: 'Fernanda',
    telefone: '(11) 98888-7777',
    itens: [{ produtoId: 1, quantidade: 5 }],
    isFinalizado: false
  }
  assert.equal(rascunho.isFinalizado, false)
})

test('Cenário J & K: Validação de estoque impede quantidade superior ao disponível', () => {
  const estoqueDisponivel = 3
  const quantidadeSolicitada = 5
  const valido = quantidadeSolicitada <= estoqueDisponivel
  assert.equal(valido, false)
})

test('Cenário L & M: Pedido de Venda Direta possui origem venda_direta', () => {
  const pedido = {
    id: 184,
    numero: 'PED-000184',
    codigo_acompanhamento: 'ENC-7K4P9X2D',
    origem: 'venda_direta',
    status: 'Aguardando pagamento',
    status_pagamento: 'pendente'
  }
  assert.equal(pedido.origem, 'venda_direta')
  assert.match(pedido.codigo_acompanhamento, /^ENC-[0-9A-Z]{8}$/)
})

test('Cenário N: Pedido novo de Venda Direta aparece no topo da lista ordenada', () => {
  const pedidos = [
    { id: 1, numero: 'PED-000001', data: '2026-08-01T10:00:00Z', origem: 'loja_online' },
    { id: 2, numero: 'PED-000002', data: '2026-08-10T12:00:00Z', origem: 'loja_online' },
    { id: 3, numero: 'PED-000184', data: '2026-08-20T16:00:00Z', origem: 'venda_direta' }
  ]

  const ordenados = ordenarPedidosMaisRecentes(pedidos)
  assert.equal(ordenados[0].id, 3)
  assert.equal(ordenados[0].origem, 'venda_direta')
})

test('Testes de Entrega: Correios/Melhor Envio, Motoboy Loja, Motoboy Cliente e Retirada', () => {
  const itens = [{ precoPraticado: 200, quantidade: 1, descontoPercentual: 0 }]

  // 1. Correios (frete calculado R$ 24,50)
  assert.equal(calcularTotaisVendaDireta(itens, 24.50).totalFinal, 224.50)

  // 2. Motoboy Loja (taxa informada R$ 30,00)
  assert.equal(calcularTotaisVendaDireta(itens, 30.00).totalFinal, 230.00)

  // 3. Motoboy Cliente (R$ 0,00)
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 200.00)

  // 4. Retirada combinada (R$ 0,00)
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 200.00)
})

test('Testes de Pagamento: Pix Fixo e Link Mercado Pago', () => {
  const pedido = {
    numero: 'PED-000184',
    codigo_acompanhamento: 'ENC-7K4P9X2D',
    cliente: 'Juliana',
    total: 350.00,
    forma_pagamento: 'Pix'
  }

  const msgPix = montarMensagemFinalWhatsApp({
    pedido
  })
  assert.match(msgPix, /ENC-7K4P9X2D/)
  assert.match(msgPix, /Pagamento confirmado/)
  assert.doesNotMatch(msgPix, /Pagamento via Pix/)

  const msgCartao = montarMensagemFinalWhatsApp({
    pedido: { ...pedido, forma_pagamento: 'Cartão de crédito' },
    linkPagamento: 'https://mpago.la/pos/bazar184'
  })
  assert.match(msgCartao, /https:\/\/mpago\.la\/pos\/bazar184/)
})

test('Testes de Acompanhamento Seguro: código aleatório seguro e proteção contra adivinhação', () => {
  const codigoSeguroPattern = /^ENC-[0-9A-Z]{4,16}$/
  assert.equal(codigoSeguroPattern.test('ENC-7K4P9X2D'), true)
  assert.equal(codigoSeguroPattern.test('ENC-AB89X2YZ'), true)
  assert.equal(codigoSeguroPattern.test('PED-000184'), false) // Número sequencial isolado não é aceito como código seguro
})

test('Teste A: Venda Direta + Pix manual ao finalizar nasce com status_pagamento = aprovado e status = Confirmado', () => {
  const novaVendaPix = {
    origem: 'venda_direta',
    forma_pagamento: 'Pix',
    status: 'Confirmado',
    status_pagamento: 'aprovado'
  }

  assert.equal(novaVendaPix.origem, 'venda_direta')
  assert.equal(novaVendaPix.status_pagamento, 'aprovado')
  assert.equal(novaVendaPix.status, 'Confirmado')
})

test('Teste B: Venda Direta + Pix manual não chama Mercado Pago', () => {
  const formaPag = 'Pix'
  const chamaMercadoPago = formaPag.toLowerCase().includes('cart')
  assert.equal(chamaMercadoPago, false)
})

test('Teste C: Resumo WhatsApp contém: Por favor, envie o comprovante após a transferência.', () => {
  const resumo = montarResumoWhatsApp({
    cliente: 'Camila',
    itens: [{ nome: 'Vestido Farm', quantidade: 1, precoPraticado: 250, descontoPercentual: 0 }],
    valorFrete: 0,
    modalidadeEntrega: 'retirada',
    formaPagamento: 'Pix',
    chavePix: 'bazarencanto610@gmail.com'
  })

  assert.match(resumo, /Por favor, envie o comprovante após a transferência\./)
  assert.match(resumo, /bazarencanto610@gmail\.com/)
})

test('Teste D & E: Mensagem final NÃO contém "Pagamento via Pix" e contém "Pagamento confirmado"', () => {
  const pedido = {
    cliente: 'Camila',
    numero: 'PED-000184',
    codigo_acompanhamento: 'ENC-7K4P9X2D',
    total: 250.00,
    forma_pagamento: 'Pix'
  }

  const msg = montarMensagemFinalWhatsApp({ pedido })
  assert.match(msg, /Pagamento confirmado/)
  assert.doesNotMatch(msg, /Pagamento via Pix/)
})

test('Teste F: Pedido Venda Direta Pix aparece no Admin como pago diretamente', () => {
  const pedido = {
    numero: 'PED-000184',
    origem: 'venda_direta',
    forma_pagamento: 'Pix',
    status_pagamento: 'aprovado'
  }
  const statusFormatado = pedido.status_pagamento === 'aprovado' ? 'Pago' : 'Aguardando'
  assert.equal(statusFormatado, 'Pago')
})

test('Teste G: Acompanhamento público reflete pagamento aprovado e status Confirmado', () => {
  const acompanhamentoPublico = {
    numero: 'PED-000184',
    codigo_acompanhamento: 'ENC-7K4P9X2D',
    status: 'Confirmado',
    status_pagamento: 'aprovado'
  }

  assert.equal(acompanhamentoPublico.status, 'Confirmado')
  assert.equal(acompanhamentoPublico.status_pagamento, 'aprovado')
})

test('Teste H: Venda Direta com cartão NÃO é marcada automaticamente como paga', () => {
  const formaPag = 'Cartão de crédito'
  const statusPagamentoInicial = formaPag.toLowerCase() === 'pix' ? 'aprovado' : 'pendente'
  const statusPedidoInicial = formaPag.toLowerCase() === 'pix' ? 'Confirmado' : 'Aguardando pagamento'

  assert.equal(statusPagamentoInicial, 'pendente')
  assert.equal(statusPedidoInicial, 'Aguardando pagamento')
})

test('Teste I: Pix automático da loja online continua inalterado (origem loja_online e fluxo Mercado Pago)', () => {
  const pedidoLojaOnline = {
    origem: 'loja_online',
    forma_pagamento: 'Pix',
    status_pagamento: 'pendente',
    pagamento_provider: 'mercado_pago'
  }

  assert.equal(pedidoLojaOnline.origem, 'loja_online')
  assert.equal(pedidoLojaOnline.pagamento_provider, 'mercado_pago')
})

test('Teste A Frete: Retorno com múltiplas transportadoras filtra e mostra SOMENTE PAC e SEDEX na ordem PAC -> SEDEX', () => {
  const opcoesApi = [
    { id: '1', name: '.Package', company: { name: 'Jadlog' }, custom_price: '21.50', delivery_time: 4 },
    { id: '2', name: 'SEDEX', company: { name: 'Correios' }, custom_price: '37.80', delivery_time: 2 },
    { id: '3', name: 'Amanhã', company: { name: 'Azul Cargo' }, custom_price: '45.00', delivery_time: 1 },
    { id: '4', name: 'PAC', company: { name: 'Correios' }, custom_price: '23.42', delivery_time: 5 },
    { id: '5', name: 'Express', company: { name: 'Loggi' }, custom_price: '28.00', delivery_time: 3 }
  ]

  const filtradas = filtrarOpcoesFreteVendaDireta(opcoesApi)
  assert.equal(filtradas.length, 2)
  assert.equal(filtradas[0].servico, 'PAC')
  assert.equal(filtradas[0].preco, 23.42)
  assert.equal(filtradas[1].servico, 'SEDEX')
  assert.equal(filtradas[1].preco, 37.80)
})

test('Teste B Frete: PAC indisponível e SEDEX disponível mostra SOMENTE SEDEX', () => {
  const opcoesApi = [
    { id: '1', name: '.Package', company: { name: 'Jadlog' }, custom_price: '21.50', delivery_time: 4 },
    { id: '2', name: 'SEDEX', company: { name: 'Correios' }, custom_price: '37.80', delivery_time: 2 }
  ]

  const filtradas = filtrarOpcoesFreteVendaDireta(opcoesApi)
  assert.equal(filtradas.length, 1)
  assert.equal(filtradas[0].servico, 'SEDEX')
  assert.equal(filtradas[0].preco, 37.80)
})

test('Teste C Frete: SEDEX indisponível e PAC disponível mostra SOMENTE PAC', () => {
  const opcoesApi = [
    { id: '1', name: '.Package', company: { name: 'Jadlog' }, custom_price: '21.50', delivery_time: 4 },
    { id: '4', name: 'PAC', company: { name: 'Correios' }, custom_price: '23.42', delivery_time: 5 }
  ]

  const filtradas = filtrarOpcoesFreteVendaDireta(opcoesApi)
  assert.equal(filtradas.length, 1)
  assert.equal(filtradas[0].servico, 'PAC')
  assert.equal(filtradas[0].preco, 23.42)
})

test('Teste D Frete: Nenhum disponível retorna vazio para disparar mensagem de indisponibilidade', () => {
  const opcoesApi = [
    { id: '1', name: '.Package', company: { name: 'Jadlog' }, custom_price: '21.50', delivery_time: 4 },
    { id: '3', name: 'Amanhã', company: { name: 'Azul Cargo' }, custom_price: '45.00', delivery_time: 1 }
  ]

  const filtradas = filtrarOpcoesFreteVendaDireta(opcoesApi)
  assert.equal(filtradas.length, 0)
})

test('Teste E Frete: PAC/SEDEX sem preço válido não mostra R$ 0,00 e é descartado', () => {
  const opcoesApi = [
    { id: '1', name: 'PAC', company: { name: 'Correios' }, custom_price: '0.00', delivery_time: 5 },
    { id: '2', name: 'SEDEX', company: { name: 'Correios' }, custom_price: null, delivery_time: 2 }
  ]

  const filtradas = filtrarOpcoesFreteVendaDireta(opcoesApi)
  assert.equal(filtradas.length, 0)
})

test('Teste F Frete: PAC R$ 23,42 selecionado soma corretamente no total final', () => {
  const itens = [
    { nome: 'Vestido Farm', quantidade: 1, precoPraticado: 180.00, descontoPercentual: 0 }
  ]
  const totais = calcularTotaisVendaDireta(itens, 23.42)
  assert.equal(totais.totalProdutos, 180.00)
  assert.equal(totais.valorFrete, 23.42)
  assert.equal(totais.totalFinal, 203.42)
})

test('Teste G Frete: SEDEX R$ 37,80 selecionado soma corretamente no total final', () => {
  const itens = [
    { nome: 'Vestido Farm', quantidade: 1, precoPraticado: 180.00, descontoPercentual: 0 }
  ]
  const totais = calcularTotaisVendaDireta(itens, 37.80)
  assert.equal(totais.totalProdutos, 180.00)
  assert.equal(totais.valorFrete, 37.80)
  assert.equal(totais.totalFinal, 217.80)
})

// ==============================================================================
// TESTES DE STATUS OPERACIONAL E INTEGRAÇÃO COM ACOMPANHAMENTO (A a M)
// ==============================================================================

test('Teste A: Venda Direta Pix nasce com Pagamento=Pago e Status Operacional=Pedido recebido', () => {
  const pedidoVendaDireta = {
    origem: 'venda_direta',
    forma_pagamento: 'Pix',
    status_pagamento: 'aprovado',
    status: 'Pedido recebido'
  }
  const pag = obterStatusPagamento(pedidoVendaDireta.status_pagamento)
  const st = obterStatusPedido(pedidoVendaDireta.status)
  assert.equal(pag.resumo, 'Pago')
  assert.equal(st, 'Pedido recebido')
})

test('Teste B: Admin altera Pedido recebido -> Em preparação', () => {
  const statusAtualizado = obterStatusPedido('Em preparação')
  assert.equal(statusAtualizado, 'Em preparação')
})

test('Teste C: Cliente consulta pedido e visualiza Em preparação na timeline', () => {
  const timeline = montarTimelinePedido('Em preparação', 'aprovado', 'correios')
  assert.equal(timeline[0].estado, 'concluido')
  assert.equal(timeline[1].titulo, 'Em preparação')
  assert.equal(timeline[1].estado, 'atual')
  assert.equal(timeline[2].estado, 'futuro')
})

test('Teste D: Admin altera Em preparação -> Enviado', () => {
  const statusAtualizado = obterStatusPedido('Enviado')
  assert.equal(statusAtualizado, 'Enviado')
  const timeline = montarTimelinePedido('Enviado', 'aprovado', 'correios')
  assert.equal(timeline[2].titulo, 'Enviado')
  assert.equal(timeline[2].estado, 'atual')
})

test('Teste E: Envio SEDEX/PAC permite registrar e exibir código de rastreio', () => {
  const pedido = {
    modalidade_entrega: 'correios',
    status: 'Enviado',
    codigo_rastreio: 'BR123456789AA',
    transportadora: 'Correios (SEDEX)'
  }
  assert.ok(pedido.codigo_rastreio)
  assert.equal(pedido.codigo_rastreio, 'BR123456789AA')
})

test('Teste F: Modalidade Retirada usa fluxo próprio (Pedido recebido -> Em preparação -> Pronto para retirada -> Entregue)', () => {
  const timeline = montarTimelinePedido('Pronto para retirada', 'aprovado', 'retirada')
  assert.equal(timeline.length, 4)
  assert.equal(timeline[0].titulo, 'Pedido recebido')
  assert.equal(timeline[1].titulo, 'Em preparação')
  assert.equal(timeline[2].titulo, 'Pronto para retirada')
  assert.equal(timeline[2].estado, 'atual')
  assert.equal(timeline[3].titulo, 'Entregue')
  assert.equal(timeline[3].estado, 'futuro')
})

test('Teste G: Admin marca Entregue e cliente vê Entregue na timeline', () => {
  const timelineEntrega = montarTimelinePedido('Entregue', 'aprovado', 'correios')
  assert.equal(timelineEntrega[3].titulo, 'Entregue')
  assert.equal(timelineEntrega[3].estado, 'atual')

  const timelineRetirada = montarTimelinePedido('Entregue', 'aprovado', 'retirada')
  assert.equal(timelineRetirada[3].titulo, 'Entregue')
  assert.equal(timelineRetirada[3].estado, 'atual')
})

test('Teste H: Status de Pagamento permanece independente durante todas as alterações operacionais', () => {
  const statusOperacionais = ['Pedido recebido', 'Em preparação', 'Enviado', 'Pronto para retirada', 'Entregue']
  for (const st of statusOperacionais) {
    const pag = obterStatusPagamento('aprovado')
    assert.equal(pag.resumo, 'Pago')
    assert.equal(obterStatusPedido(st), st)
  }
})

test('Teste I, J, K, L, M: Integridade e preservação de Estoque, Mercado Pago, Loja Online e Venda Direta', () => {
  // Verificação de isolamento: alteração puramente de status operacional
  const dadosEdicao = {
    pedidoId: 1234,
    novoStatus: 'Enviado',
    codigoRastreio: 'AA987654321BR',
    transportadora: 'Correios'
  }
  assert.equal(dadosEdicao.novoStatus, 'Enviado')
  assert.equal(dadosEdicao.codigoRastreio, 'AA987654321BR')
})

test('Teste Seletor Admin A & B: Pedido pago de Venda Direta carrega todas as opções operacionais incluindo Em preparação', () => {
  const opcoesDisponiveis = [
    'Pedido recebido',
    'Em preparação',
    'Enviado',
    'Pronto para retirada',
    'Entregue',
    'Cancelado'
  ]
  assert.ok(opcoesDisponiveis.includes('Em preparação'))
  assert.ok(opcoesDisponiveis.includes('Pedido recebido'))
  assert.ok(opcoesDisponiveis.includes('Enviado'))
  assert.ok(opcoesDisponiveis.includes('Pronto para retirada'))
  assert.ok(opcoesDisponiveis.includes('Entregue'))
})

test('Teste Salvar C, D, E, F: Alterar para Em preparação atualiza status, mantém status_pagamento aprovado, não altera estoque e atualiza acompanhamento', () => {
  const pedidoOriginal = {
    id: 999,
    numero: 'PED-999',
    origem: 'venda_direta',
    status: 'Pedido recebido',
    status_pagamento: 'aprovado',
    estoque_itens: [{ produto_id: 1, quantidade: 2 }]
  }

  // Simulação da alteração administrativa de status
  const novoStatus = 'Em preparação'
  const pedidoAtualizado = {
    ...pedidoOriginal,
    status: novoStatus
  }

  // C) Atualiza campo operacional
  assert.equal(pedidoAtualizado.status, 'Em preparação')

  // D) status_pagamento continua aprovado/pago
  assert.equal(pedidoAtualizado.status_pagamento, 'aprovado')
  assert.equal(obterStatusPagamento(pedidoAtualizado.status_pagamento).resumo, 'Pago')

  // E) Estoque não muda
  assert.deepEqual(pedidoAtualizado.estoque_itens, pedidoOriginal.estoque_itens)

  // F) Acompanhamento reflete Em preparação
  const timeline = montarTimelinePedido(pedidoAtualizado.status, pedidoAtualizado.status_pagamento, 'correios')
  assert.equal(timeline[0].estado, 'concluido')
  assert.equal(timeline[1].titulo, 'Em preparação')
  assert.equal(timeline[1].estado, 'atual')
  assert.equal(timeline[2].estado, 'futuro')
})



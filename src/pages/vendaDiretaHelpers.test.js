import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatarPreco,
  normalizarTelefone,
  normalizarCep,
  formatarCep,
  calcularPrecoComDesconto,
  calcularTotaisVendaDireta,
  montarResumoWhatsApp,
  montarMensagemFinalWhatsApp
} from './vendaDiretaHelpers.js'

test('formatarPreco formata valores em BRL corretamente', () => {
  assert.match(formatarPreco(189.9), /189,90/)
  assert.match(formatarPreco(0), /0,00/)
  assert.match(formatarPreco(450), /450,00/)
})

test('normalizarTelefone e normalizarCep tratam caracteres especiais', () => {
  assert.equal(normalizarTelefone('11999887766'), '(11) 99988-7766')
  assert.equal(normalizarTelefone('1133221100'), '(11) 3322-1100')
  assert.equal(normalizarCep('01310-930'), '01310930')
  assert.equal(formatarCep('01310930'), '01310-930')
})

test('A) Adicionar produto Preto/M calcula preço e desconto unitário', () => {
  const calc = calcularPrecoComDesconto(200, 5)
  assert.equal(calc.precoOriginal, 200)
  assert.equal(calc.percentualDesconto, 5)
  assert.equal(calc.descontoUnitario, 10)
  assert.equal(calc.precoLiquido, 190)
})

test('B) Preço 200 com desconto de 5% e quantidade 2 resulta em total 380', () => {
  const itens = [
    {
      nome: 'Vestido Farm',
      cor: 'Preto',
      tamanho: 'M',
      quantidade: 2,
      precoPraticado: 200,
      descontoPercentual: 5
    }
  ]
  const totais = calcularTotaisVendaDireta(itens, 0)
  assert.equal(totais.subtotalBruto, 400)
  assert.equal(totais.totalDescontos, 20)
  assert.equal(totais.totalProdutos, 380)
  assert.equal(totais.totalFinal, 380)
  assert.equal(totais.totalItensQtd, 2)
})

test('C) Múltiplos produtos na venda calculam subtotal, descontos e frete acumulado', () => {
  const itens = [
    {
      nome: 'Vestido Farm',
      cor: 'Preto',
      tamanho: 'M',
      quantidade: 1,
      precoPraticado: 189.90,
      descontoPercentual: 5
    },
    {
      nome: 'Blusa Farm',
      cor: 'Rosa',
      tamanho: 'P',
      quantidade: 2,
      precoPraticado: 129.90,
      descontoPercentual: 0
    }
  ]
  const totais = calcularTotaisVendaDireta(itens, 25.00)
  // Item 1: 189.90 * 0.05 = 9.50 desc => 180.40 liq
  // Item 2: 129.90 * 2 = 259.80
  // Total prod: 180.40 + 259.80 = 440.20
  // Total final c/ frete (25): 465.20
  assert.equal(totais.totalItensQtd, 3)
  assert.equal(totais.valorFrete, 25.00)
  assert.equal(totais.totalFinal, 465.20)
})

test('D) Editar item ou remover item recalcula totais perfeitamente', () => {
  let itens = [
    { nome: 'Peça A', quantidade: 1, precoPraticado: 100, descontoPercentual: 10 },
    { nome: 'Peça B', quantidade: 1, precoPraticado: 100, descontoPercentual: 0 }
  ]
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 190)

  // Remover Peça B
  itens = itens.filter(i => i.nome !== 'Peça B')
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 90)

  // Editar quantidade de Peça A para 3
  itens[0].quantidade = 3
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 270)
})

test('E) Entregas: Correios, Motoboy Loja, Motoboy Cliente e Retirada', () => {
  const itens = [{ nome: 'Vestido', quantidade: 1, precoPraticado: 150, descontoPercentual: 0 }]

  // Motoboy Loja com R$ 30
  assert.equal(calcularTotaisVendaDireta(itens, 30).totalFinal, 180)

  // Motoboy Cliente com R$ 0
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 150)

  // Retirada combinada com R$ 0
  assert.equal(calcularTotaisVendaDireta(itens, 0).totalFinal, 150)
})

test('F) Copiar Resumo para WhatsApp monta texto claro e organizado com pedido de comprovante', () => {
  const itens = [
    { nome: 'Vestido Farm', cor: 'Preto', tamanho: 'M', quantidade: 1, precoPraticado: 180.41, descontoPercentual: 0 },
    { nome: 'Blusa Farm', cor: 'Rosa', tamanho: 'P', quantidade: 2, precoPraticado: 129.90, descontoPercentual: 0 }
  ]
  const resumo = montarResumoWhatsApp({
    cliente: 'Maria',
    itens,
    valorFrete: 23.42,
    modalidadeEntrega: 'correios',
    formaPagamento: 'Pix',
    chavePix: 'bazarencanto610@gmail.com'
  })

  assert.match(resumo, /Maria/)
  assert.match(resumo, /Vestido Farm/)
  assert.match(resumo, /Preto/)
  assert.match(resumo, /Tam: M/)
  assert.match(resumo, /Blusa Farm/)
  assert.match(resumo, /Rosa/)
  assert.match(resumo, /Tam: P/)
  assert.match(resumo, /TOTAL:/)
  assert.match(resumo, /bazarencanto610@gmail\.com/)
  assert.match(resumo, /Por favor, envie o comprovante após a transferência\./)
})

test('G) Copiar Mensagem Final para WhatsApp contém código seguro e status Pagamento confirmado sem expor dados internos nem Pagamento via Pix', () => {
  const pedido = {
    cliente: 'Maria Silva',
    numero: 'PED-000184',
    codigo_acompanhamento: 'ENC-7K4P9X2D',
    total: 463.63,
    forma_pagamento: 'Pix'
  }
  const msg = montarMensagemFinalWhatsApp({
    pedido
  })

  assert.match(msg, /Maria Silva/)
  assert.match(msg, /PED-000184/)
  assert.match(msg, /ENC-7K4P9X2D/)
  assert.match(msg, /Pagamento confirmado/)
  assert.doesNotMatch(msg, /Pagamento via Pix/)
  assert.match(msg, /acompanhar-pedido/)
  assert.doesNotMatch(msg, /custo/)
  assert.doesNotMatch(msg, /lucro/)
})

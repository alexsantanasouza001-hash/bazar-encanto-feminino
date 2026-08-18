import assert from 'node:assert/strict'
import test from 'node:test'

import {
  obterStatusPagamento,
  obterStatusPedido,
  obterTransicoesPedido,
  montarTimelinePedido,
  ehPedidoDeTeste,
} from './statusHelpers.js'

test('status de pagamento diferencia estados finais e pendente', () => {
  assert.equal(obterStatusPagamento('aprovado').titulo, 'Pagamento confirmado')
  assert.equal(obterStatusPagamento('pendente').pendente, true)
  assert.equal(obterStatusPagamento('recusado').mensagemAtualizacao, 'Pagamento não aprovado.')
  assert.equal(obterStatusPagamento('expirado').mensagemAtualizacao, 'O prazo para pagamento expirou.')
})
test('status de pagamento ausente ou desconhecido nunca assume aprovação', () => {
  for (const status of [null, '', 'estado_novo']) {
    const resultado = obterStatusPagamento(status)
    assert.equal(resultado.aprovado, false)
    assert.equal(resultado.titulo, 'Status do pagamento não informado')
  }
})

test('status do pedido só confirma valores conhecidos', () => {
  assert.equal(obterStatusPedido('Confirmado'), 'Confirmado')
  assert.equal(obterStatusPedido('novo'), 'Confirmado')
  assert.equal(obterStatusPedido(null), 'Status não informado')
  assert.equal(obterStatusPedido('qualquer-coisa'), 'Status não informado')
})

test('fluxo inclui entregue e bloqueia regressao de status terminal', () => {
  assert.equal(obterStatusPedido('entregue'), 'Entregue')
  assert.deepEqual(obterTransicoesPedido('Enviado'), ['Entregue'])
  assert.deepEqual(obterTransicoesPedido('Concluído'), [])
  assert.deepEqual(obterTransicoesPedido('Cancelado'), [])
})

test('timeline nao conclui etapas futuras', () => {
  const timeline = montarTimelinePedido('Enviado', 'aprovado')
  assert.equal(timeline.find((item) => item.titulo === 'Enviado')?.estado, 'atual')
  assert.equal(timeline.find((item) => item.titulo === 'Entregue')?.estado, 'futuro')
})

test('identifica pedidos de teste com precisao e preserva pedidos reais', () => {
  // Casos de teste
  assert.equal(ehPedidoDeTeste({ email_cliente: 'cliente@example.com' }), true)
  assert.equal(ehPedidoDeTeste({ email: 'usuario@teste.com' }), true)
  assert.equal(ehPedidoDeTeste({ cliente: 'Comprador Teste' }), true)
  assert.equal(ehPedidoDeTeste({ external_reference: 'diag_checkout_123' }), true)
  assert.equal(ehPedidoDeTeste({ payment_id: 'mock_pix_999' }), true)

  // Pedidos reais de produção NÃO são considerados teste
  assert.equal(ehPedidoDeTeste({
    cliente: 'Maria da Silva',
    email_cliente: 'maria.silva@gmail.com',
    telefone: '11999998888',
    external_reference: 'ped_1723456789',
    payment_id: '8877665544'
  }), false)

  assert.equal(ehPedidoDeTeste(null), false)
  assert.equal(ehPedidoDeTeste({}), false)
})

test('status de pagamento reconhece sinonimos de aprovado e pendente', () => {
  for (const s of ['approved', 'pago', 'confirmado', 'paga', 'paid']) {
    const res = obterStatusPagamento(s)
    assert.equal(res.aprovado, true, `Status ${s} deve ser aprovado`)
    assert.equal(res.pendente, false)
    assert.equal(res.titulo, 'Pagamento confirmado')
  }

  for (const s of ['pending', 'in_process', 'action_required', 'aguardando', 'aguardando pagamento']) {
    const res = obterStatusPagamento(s)
    assert.equal(res.aprovado, false)
    assert.equal(res.pendente, true, `Status ${s} deve ser pendente`)
    assert.equal(res.titulo, 'Aguardando pagamento')
  }
})

test('transição de polling: resultado aprovado atualiza status e desativa pendência', () => {
  const estadoInicial = {
    numero: 'PED-1786458117032',
    pagamento_consulta_token: '11111111-2222-3333-4444-555555555555',
    status_pagamento: 'pendente',
    status: 'Aguardando pagamento'
  }

  const { pendente: pendenteInicial } = obterStatusPagamento(estadoInicial.status_pagamento)
  assert.equal(pendenteInicial, true)

  const resultadoPolling = {
    sucesso: true,
    pedido: {
      ...estadoInicial,
      status_pagamento: 'aprovado',
      status: 'Confirmado'
    }
  }

  const { aprovado: foiAprovado, pendente: pendenteFinal } = obterStatusPagamento(resultadoPolling.pedido.status_pagamento)
  assert.equal(foiAprovado, true)
  assert.equal(pendenteFinal, false)
})



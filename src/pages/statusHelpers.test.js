import assert from 'node:assert/strict'
import test from 'node:test'

import {
  obterStatusPagamento,
  obterStatusPedido,
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

test('status operacional reconhece todos os status requeridos', () => {
  assert.equal(obterStatusPedido('Pedido recebido'), 'Pedido recebido')
  assert.equal(obterStatusPedido('recebido'), 'Pedido recebido')
  assert.equal(obterStatusPedido('novo'), 'Pedido recebido')
  assert.equal(obterStatusPedido('Confirmado'), 'Pedido recebido')
  assert.equal(obterStatusPedido('Em preparação'), 'Em preparação')
  assert.equal(obterStatusPedido('em preparacao'), 'Em preparação')
  assert.equal(obterStatusPedido('Enviado'), 'Enviado')
  assert.equal(obterStatusPedido('Pronto para retirada'), 'Pronto para retirada')
  assert.equal(obterStatusPedido('Entregue'), 'Entregue')
  assert.equal(obterStatusPedido('Cancelado'), 'Cancelado')
  assert.equal(obterStatusPedido(null), 'Pedido recebido')
  assert.equal(obterStatusPedido(''), 'Pedido recebido')
})

test('timeline de entrega PAC / SEDEX / Motoboy (Pedido recebido -> Em preparação -> Enviado -> Entregue)', () => {
  // Teste 1: Pedido recebido
  const tRecebido = montarTimelinePedido('Pedido recebido', 'aprovado', 'correios')
  assert.equal(tRecebido[0].titulo, 'Pedido recebido')
  assert.equal(tRecebido[0].estado, 'atual')
  assert.equal(tRecebido[1].titulo, 'Em preparação')
  assert.equal(tRecebido[1].estado, 'futuro')
  assert.equal(tRecebido[2].titulo, 'Enviado')
  assert.equal(tRecebido[2].estado, 'futuro')
  assert.equal(tRecebido[3].titulo, 'Entregue')
  assert.equal(tRecebido[3].estado, 'futuro')

  // Teste 2: Em preparação
  const tPrep = montarTimelinePedido('Em preparação', 'aprovado', 'correios')
  assert.equal(tPrep[0].estado, 'concluido')
  assert.equal(tPrep[1].estado, 'atual')
  assert.equal(tPrep[2].estado, 'futuro')
  assert.equal(tPrep[3].estado, 'futuro')

  // Teste 3: Enviado
  const tEnv = montarTimelinePedido('Enviado', 'aprovado', 'correios')
  assert.equal(tEnv[0].estado, 'concluido')
  assert.equal(tEnv[1].estado, 'concluido')
  assert.equal(tEnv[2].estado, 'atual')
  assert.equal(tEnv[3].estado, 'futuro')

  // Teste 4: Entregue
  const tEnt = montarTimelinePedido('Entregue', 'aprovado', 'correios')
  assert.equal(tEnt[0].estado, 'concluido')
  assert.equal(tEnt[1].estado, 'concluido')
  assert.equal(tEnt[2].estado, 'concluido')
  assert.equal(tEnt[3].estado, 'atual')
})

test('timeline de retirada (Pedido recebido -> Em preparação -> Pronto para retirada -> Entregue)', () => {
  // Teste 1: Pronto para retirada
  const tRetirada = montarTimelinePedido('Pronto para retirada', 'aprovado', 'retirada')
  assert.equal(tRetirada[0].titulo, 'Pedido recebido')
  assert.equal(tRetirada[0].estado, 'concluido')
  assert.equal(tRetirada[1].titulo, 'Em preparação')
  assert.equal(tRetirada[1].estado, 'concluido')
  assert.equal(tRetirada[2].titulo, 'Pronto para retirada')
  assert.equal(tRetirada[2].estado, 'atual')
  assert.equal(tRetirada[3].titulo, 'Entregue')
  assert.equal(tRetirada[3].estado, 'futuro')

  // Teste 2: Entregue
  const tEntregue = montarTimelinePedido('Entregue', 'aprovado', 'retirada')
  assert.equal(tEntregue[0].estado, 'concluido')
  assert.equal(tEntregue[1].estado, 'concluido')
  assert.equal(tEntregue[2].estado, 'concluido')
  assert.equal(tEntregue[3].estado, 'atual')
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

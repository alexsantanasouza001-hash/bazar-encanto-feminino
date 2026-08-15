import assert from 'node:assert/strict'
import test from 'node:test'

import {
  obterStatusPagamento,
  obterStatusPedido,
  obterTransicoesPedido,
  montarTimelinePedido,
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

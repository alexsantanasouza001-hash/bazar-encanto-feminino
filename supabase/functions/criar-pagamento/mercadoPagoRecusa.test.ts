import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { extrairResultadoRecusaMercadoPago } from './mercadoPagoRecusa.ts'

test('HTTP 402 preserva Order ID e o detalhe específico da transação', () => {
  const resultado = extrairResultadoRecusaMercadoPago({
    errors: [{
      code: 'failed',
      message: 'The following transactions failed',
    }],
    data: {
      id: 'ORDTST01EXEMPLO',
      status: 'failed',
      status_detail: 'failed',
      transactions: {
        payments: [{
          status: 'failed',
          status_detail: 'cc_rejected_other_reason',
        }],
      },
    },
  }, 'mp_failed')

  assert.deepEqual(resultado, {
    orderId: 'ORDTST01EXEMPLO',
    statusDetail: 'cc_rejected_other_reason',
  })
})

test('HTTP 402 sem Order ID mantém null e usa fallback seguro', () => {
  const resultado = extrairResultadoRecusaMercadoPago({
    errors: [{ code: 'failed' }],
  }, 'mp_failed')

  assert.deepEqual(resultado, {
    orderId: null,
    statusDetail: 'mp_failed',
  })
})

test('resposta ambígua não transforma detalhe de aprovação em confirmação', () => {
  const resultado = extrairResultadoRecusaMercadoPago({
    data: {
      id: 'ORDTST01AMBIGUA',
      status: 'processed',
      status_detail: 'accredited',
      transactions: {
        payments: [{
          status: 'processed',
          status_detail: 'accredited',
        }],
      },
    },
  }, 'mp_failed')

  assert.deepEqual(resultado, {
    orderId: 'ORDTST01AMBIGUA',
    statusDetail: 'mp_failed',
  })
})

test('a liberação continua idempotente e restrita a reservas ativas', () => {
  const migration = readFileSync(
    new URL(
      '../../migrations/20260812010000_mercadopago_pagamentos_reservas.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const inicio = migration.indexOf(
    'create or replace function public.liberar_reserva_pedido',
  )
  const fim = migration.indexOf(
    'create or replace function public.criar_pedido_pagamento',
    inicio,
  )
  const liberarReserva = migration.slice(inicio, fim)

  assert.ok(inicio >= 0 && fim > inicio)
  assert.match(
    liberarReserva,
    /where pedido_id = p_pedido_id\s+and status = 'reservado'/,
  )
  assert.match(
    liberarReserva,
    /set status = 'liberado'/,
  )
})

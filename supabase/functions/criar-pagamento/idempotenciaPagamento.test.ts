import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL(
    '../../migrations/20260812191500_pagamento_idempotencia_contexto.sql',
    import.meta.url,
  ),
  'utf8',
)

test('retry sempre atravessa as validacoes completas do checkout', () => {
  const chamadaCheckout = migration.indexOf(
    'v_pedido := public.criar_pedido_checkout',
  )
  const retornoExistente = migration.indexOf(
    'return to_jsonb(v_existente)',
  )

  assert.ok(chamadaCheckout >= 0)
  assert.ok(retornoExistente > chamadaCheckout)
  assert.match(migration, /p_itens,[\s\S]+p_cupom,[\s\S]+p_idempotency_key,[\s\S]+p_entrega/)
})

test('forma diferente gera conflito seguro sem inicializar reserva', () => {
  const conflito = migration.indexOf(
    "raise exception 'idempotency_context_mismatch'",
  )
  const inicializacao = migration.indexOf(
    "set status = 'Aguardando pagamento'",
  )

  assert.ok(conflito >= 0)
  assert.ok(inicializacao > conflito)
  assert.match(migration, /using errcode = '23505'/)
})

test('retry existente retorna antes de atualizar pedido ou inserir reserva', () => {
  const retornoExistente = migration.indexOf(
    'return to_jsonb(v_existente)',
  )
  const updatePedido = migration.indexOf(
    "set status = 'Aguardando pagamento'",
  )
  const insertReserva = migration.indexOf(
    'insert into public.reservas_estoque',
  )

  assert.ok(retornoExistente >= 0)
  assert.ok(updatePedido > retornoExistente)
  assert.ok(insertReserva > retornoExistente)
})

test('concorrencia continua serializada pela RPC base e reserva e unica', () => {
  const seguranca = readFileSync(
    new URL(
      '../../migrations/20260811211140_final_checkout_security.sql',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    seguranca,
    /create unique index pedidos_idempotency_key_unique_idx/,
  )
  assert.match(
    migration,
    /v_pedido := public\.criar_pedido_checkout/,
  )
  assert.match(
    migration,
    /on conflict \(pedido_item_id\) do nothing/,
  )
})

test('RPC permanece restrita ao service_role', () => {
  assert.match(
    migration,
    /revoke all privileges on function public\.criar_pedido_pagamento[\s\S]+from public, anon, authenticated, service_role/,
  )
  assert.match(
    migration,
    /grant execute on function public\.criar_pedido_pagamento[\s\S]+to service_role/,
  )
})

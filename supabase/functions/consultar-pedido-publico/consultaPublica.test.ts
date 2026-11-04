import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const edge = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../../migrations/20260812203000_pos_venda_acompanhamento.sql', import.meta.url),
  'utf8',
)

test('consulta normaliza código seguro e número sem colocar dados na URL', () => {
  assert.match(edge, /entradaCodigo/)
  assert.match(edge, /CODIGO_SEGURO_PATTERN/)
  assert.doesNotMatch(edge, /searchParams\.set\([^\n]*email/)
})

test('erros de correspondência são genéricos para proteger pedidos', () => {
  assert.match(edge, /Pedido não encontrado ou código inválido\./)
})

test('rate limit persistente cobre IP, hora e combinação da consulta', () => {
  for (const escopo of ['tracking_ip_5m', 'tracking_ip_1h', 'tracking_lookup_15m']) {
    assert.match(edge, new RegExp(escopo))
    assert.match(migration, new RegExp(escopo))
  }
  assert.match(edge, /request,\s*429,/)
})

test('RPC pública retorna apenas o recorte permitido', () => {
  for (const proibido of [
    "'user_id'", "'email_cliente'", "'idempotency_key'",
    "'pagamento_consulta_token'", "'pagamento_id'",
  ]) {
    assert.doesNotMatch(
      migration.slice(migration.indexOf('create or replace function public.consultar_pedido_publico')),
      new RegExp(proibido),
    )
  }
})

test('produto inativo fica fora do catálogo e bloqueado no checkout', () => {
  assert.match(migration, /ativo boolean not null default true/)
  assert.match(migration, /using \(\s*ativo = true/)
  assert.match(migration, /before insert on public\.pedido_itens/)
  assert.match(migration, /and ativo = true/)
})

test('atualizações administrativas passam pela RPC controlada', () => {
  assert.match(migration, /app_metadata[^\n]+role[^\n]+admin/)
  assert.match(migration, /revoke update on table public\.pedidos from authenticated/)
  assert.match(migration, /v_status_atual = 'Enviado' and v_novo_status = 'Entregue'/)
  assert.match(migration, /v_status_atual = 'Entregue' and v_novo_status = 'Concluído'/)
})

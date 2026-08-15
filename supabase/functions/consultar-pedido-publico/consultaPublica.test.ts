import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const edge = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../../migrations/20260812203000_pos_venda_acompanhamento.sql', import.meta.url),
  'utf8',
)

test('consulta normaliza número e e-mail sem colocar e-mail na URL', () => {
  assert.match(edge, /corpo\.numero\.trim\(\)\.toUpperCase\(\)/)
  assert.match(edge, /corpo\.email\.trim\(\)\.toLowerCase\(\)/)
  assert.match(edge, /NUMERO_PATTERN/)
  assert.doesNotMatch(edge, /searchParams\.set\([^\n]*email/)
})

test('erros de correspondência não diferenciam pedido e e-mail', () => {
  assert.match(edge, /Pedido não encontrado ou dados inválidos\./)
  assert.doesNotMatch(edge, /E-mail não corresponde|Pedido inexistente/)
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
  assert.match(migration, /grant execute on function public\.consultar_pedido_publico\(text, text\)\s+to service_role/)
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

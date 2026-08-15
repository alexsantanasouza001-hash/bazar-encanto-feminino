import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  anonimizarRateLimit,
  criarRegrasRateLimit,
  obterIpCliente,
} from './rateLimit.ts'

test('identidades diferentes geram hashes independentes e estaveis', async () => {
  const primeiro = await anonimizarRateLimit('segredo-local', 'email', 'a@example.com')
  const repetido = await anonimizarRateLimit('segredo-local', 'email', 'a@example.com')
  const diferente = await anonimizarRateLimit('segredo-local', 'email', 'b@example.com')

  assert.equal(primeiro, repetido)
  assert.notEqual(primeiro, diferente)
  assert.match(primeiro, /^[0-9a-f]{64}$/)
})
test('Pix recebe limites gerais e limites especificos', () => {
  const regras = criarRegrasRateLimit({
    ip: '203.0.113.10',
    email: ' Cliente@Example.com ',
    userId: null,
    pix: true,
  })

  assert.deepEqual(
    regras.map((regra) => regra.escopo),
    [
      'checkout_ip_5m',
      'checkout_ip_1h',
      'checkout_email_30m',
      'pix_ip_30m',
      'pix_email_45m',
    ],
  )
  assert.equal(regras.at(-1)?.identidade, 'cliente@example.com')
})

test('identidade autenticada recebe limite proprio', () => {
  const regras = criarRegrasRateLimit({
    ip: null,
    email: 'cliente@example.com',
    userId: 'A0B1-C2D3',
    pix: false,
  })

  assert.deepEqual(
    regras.map((regra) => regra.escopo),
    ['checkout_email_30m', 'checkout_user_30m'],
  )
})

test('IP usa apenas headers esperados e rejeita valor arbitrario', () => {
  const valido = new Request('https://example.com', {
    headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
  })
  const invalido = new Request('https://example.com', {
    headers: { 'x-forwarded-for': 'nao-e-um-ip' },
  })

  assert.equal(obterIpCliente(valido), '203.0.113.10')
  assert.equal(obterIpCliente(invalido), null)
})

test('migration preserva atomicidade, RLS e acesso exclusivo do service_role', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260812190000_checkout_rate_limit.sql', import.meta.url),
    'utf8',
  )

  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /unique \(escopo, identidade_hash, evento_hash\)/)
  assert.match(migration, /enable row level security/)
  assert.match(
    migration,
    /revoke all privileges on table public\.checkout_rate_limits\s+from public, anon, authenticated, service_role/,
  )
  assert.match(
    migration,
    /grant execute on function public\.consumir_rate_limit_checkout[\s\S]+to service_role/,
  )
})

test('janela expirada e removida antes de contabilizar uma nova tentativa', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260812190000_checkout_rate_limit.sql', import.meta.url),
    'utf8',
  )

  const limpeza = migration.indexOf(
    'delete from public.checkout_rate_limits',
  )
  const contagem = migration.indexOf(
    'select count(*), min(expira_em)',
  )

  assert.ok(limpeza >= 0)
  assert.ok(contagem > limpeza)
  assert.match(migration, /expira_em <= v_agora/)
})

test('retry da mesma idempotency key nao cria novo consumo', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260812190000_checkout_rate_limit.sql', import.meta.url),
    'utf8',
  )

  const eventoExistente = migration.indexOf(
    'and evento_hash = p_evento_hash',
  )
  const insercao = migration.indexOf(
    'insert into public.checkout_rate_limits',
  )

  assert.ok(eventoExistente >= 0)
  assert.ok(insercao > eventoExistente)
  assert.match(
    migration,
    /unique \(escopo, identidade_hash, evento_hash\)/,
  )
})

test('limites Pix permanecem mais restritos sem substituir os limites gerais', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260812190000_checkout_rate_limit.sql', import.meta.url),
    'utf8',
  )

  assert.match(
    migration,
    /when 'pix_ip_30m' then\s+v_limite := 8;\s+v_janela_segundos := 1800;/,
  )
  assert.match(
    migration,
    /when 'pix_email_45m' then\s+v_limite := 2;\s+v_janela_segundos := 2700;/,
  )
})

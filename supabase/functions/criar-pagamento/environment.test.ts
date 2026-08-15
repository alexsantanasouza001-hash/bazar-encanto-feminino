import assert from 'node:assert/strict'
import test from 'node:test'

import {
  obterAmbienteMercadoPago,
  usarPagadorSintetico,
} from './environment.ts'

test('ambiente precisa ser sandbox ou production explicitamente', () => {
  assert.equal(obterAmbienteMercadoPago(undefined), null)
  assert.equal(obterAmbienteMercadoPago(''), null)
  assert.equal(obterAmbienteMercadoPago('homologacao'), null)
  assert.equal(obterAmbienteMercadoPago(' sandbox '), 'sandbox')
  assert.equal(obterAmbienteMercadoPago('PRODUCTION'), 'production')
})
test('pagador sintetico existe para sandbox em todas as formas de pagamento', () => {
  assert.equal(usarPagadorSintetico('sandbox'), true)
  assert.equal(usarPagadorSintetico('production'), false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularRegraFrete,
  calcularIncentivoFreteGratis,
  normalizarCepFrete
} from './checkoutShipping.js'

test('FRETE GRÁTIS >= R$ 400 para todo o Brasil', () => {
  const resultado400 = calcularRegraFrete({
    subtotal: 400,
    desconto: 0,
    uf: 'SP',
    cepConfirmado: true
  })
  assert.equal(resultado400.status, 'gratis')
  assert.equal(resultado400.valido, true)
  assert.equal(resultado400.valor, 0)
  assert.equal(resultado400.regiao, 'Brasil')

  const resultadoAcima = calcularRegraFrete({
    subtotal: 550,
    desconto: 50,
    uf: 'BA',
    cepConfirmado: true
  })
  assert.equal(resultadoAcima.status, 'gratis')
  assert.equal(resultadoAcima.valido, true)
  assert.equal(resultadoAcima.valor, 0)
})

test('Subtotal < R$ 400 NÃO aplica mais frete fixo de R$ 19,90 para Sul ou Sudeste', () => {
  const sp = calcularRegraFrete({
    subtotal: 200,
    desconto: 0,
    uf: 'SP',
    cepConfirmado: true
  })
  assert.notEqual(sp.status, 'fixo')
  assert.equal(sp.valor, null)
  assert.equal(sp.status, 'consultar')
  assert.equal(sp.valido, false)

  const rs = calcularRegraFrete({
    subtotal: 350,
    desconto: 0,
    uf: 'RS',
    cepConfirmado: true
  })
  assert.notEqual(rs.status, 'fixo')
  assert.equal(rs.valor, null)
  assert.equal(rs.status, 'consultar')
  assert.equal(rs.valido, false)
})

test('Subtotal < R$ 400 com serviço real selecionado assume valor calculado', () => {
  const pac = calcularRegraFrete({
    subtotal: 250,
    desconto: 0,
    uf: 'RJ',
    cepConfirmado: true,
    servicoSelecionado: {
      nome: 'PAC',
      valor: 27.5,
      prazo: '5 a 7 dias úteis'
    }
  })
  assert.equal(pac.status, 'calculado')
  assert.equal(pac.valido, true)
  assert.equal(pac.valor, 27.5)
  assert.equal(pac.servico, 'PAC')
})

test('Incentivo para frete grátis calcula valor restante até R$ 400', () => {
  assert.equal(calcularIncentivoFreteGratis(250), 150)
  assert.equal(calcularIncentivoFreteGratis(399.9), 0.1)
  assert.equal(calcularIncentivoFreteGratis(400), 0)
  assert.equal(calcularIncentivoFreteGratis(450), 0)
})

test('Normalização de CEP remove caracteres não numéricos e limita a 8 dígitos', () => {
  assert.equal(normalizarCepFrete('01310-100'), '01310100')
  assert.equal(normalizarCepFrete('01.310-100abc'), '01310100')
  assert.equal(normalizarCepFrete('  04538 133  '), '04538133')
  assert.equal(normalizarCepFrete(''), '')
})

test('Subtotal < R$ 400 sem CEP confirmado fica aguardando CEP e não inventa frete', () => {
  const semCep = calcularRegraFrete({
    subtotal: 180,
    desconto: 0,
    uf: '',
    cepConfirmado: false
  })
  assert.equal(semCep.status, 'aguardando_cep')
  assert.equal(semCep.valido, false)
  assert.equal(semCep.valor, null)
})

test('Subtotal < R$ 400 com CEP confirmado mas sem provedor logístico bloqueia finalização sem frete', () => {
  const comCepSemCotacao = calcularRegraFrete({
    subtotal: 180,
    desconto: 0,
    uf: 'MG',
    cepConfirmado: true,
    servicoSelecionado: null
  })
  assert.equal(comCepSemCotacao.status, 'consultar')
  assert.equal(comCepSemCotacao.valido, false)
  assert.equal(comCepSemCotacao.valor, null)
})

test('Subtotal < R$ 400 com SEDEX Melhor Envio calcula valor e prazo', () => {
  const sedex = calcularRegraFrete({
    subtotal: 320,
    desconto: 20,
    uf: 'PR',
    cepConfirmado: true,
    servicoSelecionado: {
      nome: 'SEDEX (Correios)',
      valor: 42.9,
      prazo: '2 a 3 dias úteis'
    }
  })
  assert.equal(sedex.status, 'calculado')
  assert.equal(sedex.valido, true)
  assert.equal(sedex.valor, 42.9)
  assert.equal(sedex.servico, 'SEDEX (Correios)')
  assert.equal(sedex.prazo, '2 a 3 dias úteis')
})

test('Subtotal R$ 420 com cupom de R$ 50 resulta em R$ 370 e exige cotação de frete', () => {
  const comDesconto = calcularRegraFrete({
    subtotal: 420,
    desconto: 50,
    uf: 'SP',
    cepConfirmado: true,
    servicoSelecionado: null
  })
  assert.equal(comDesconto.status, 'consultar')
  assert.equal(comDesconto.valido, false)
  assert.equal(comDesconto.baseFreteGratis, 370)
})
